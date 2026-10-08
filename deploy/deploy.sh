#!/bin/sh
# EmberSign blue/green deploy, zero downtime. Run as root from the repo checkout (SRC).
#   sh deploy/deploy.sh
# Slots: /opt/ember-a (8195) and /opt/ember-b (8196). nginx points at the live slot via ember-port.conf.
# The idle slot is built while the live one serves; old static chunks are kept so open pages never 404.
set -eu
SRC=${SRC:-$(pwd)}
SNIP=/etc/nginx/snippets/ember-port.conf
id ember >/dev/null 2>&1 || useradd --system --home /opt/ember-a --shell /usr/sbin/nologin ember
chown root:ember /etc/ember.env && chmod 640 /etc/ember.env

LIVE=$(sed -n 's/.*ember_port \([0-9]*\);.*/\1/p' "$SNIP" 2>/dev/null || true)
if [ "$LIVE" = "8195" ]; then NEW=b; NEWPORT=8196; OLD=a; else NEW=a; NEWPORT=8195; OLD=b; fi
[ -z "$LIVE" ] && OLD=legacy
DIR=/opt/ember-$NEW
echo "live=${LIVE:-none} -> building slot $NEW on $NEWPORT"

mkdir -p "$DIR"
rsync -a --delete --exclude .next --exclude program/target --exclude build.log --exclude PORT "$SRC"/ "$DIR"/
echo "$NEWPORT" > "$DIR/PORT"
cd "$DIR"
set -a; . /etc/ember.env; set +a
# typecheck here (cheap) since next build skips it; generated route types from the last build go first
rm -rf "$DIR/.next/types"
npx tsc --noEmit -p . 2>&1 | grep -v "^program/tests" | head -5 | grep . && { echo "typecheck failed"; exit 1; } || true
NODE_OPTIONS=--max-old-space-size=1800 systemd-run --quiet --scope -p MemoryMax=2200M nice npx next build > /tmp/ember-deploy-build.log 2>&1 || { tail -30 /tmp/ember-deploy-build.log; exit 1; }
# keep the previous build's hashed assets so pages loaded before the switch keep working
for prev in /opt/ember-$OLD /opt/ember; do [ -d "$prev/.next/static" ] && cp -rn "$prev/.next/static/." "$DIR/.next/static/" || true; done
chown -R ember:ember "$DIR"

install -m 644 "$SRC/deploy/ember@.service" /etc/systemd/system/ember@.service
systemctl daemon-reload
systemctl restart "ember@$NEW"
HP=$(sed -n "s/^EMBER_BASE_PATH=//p" /etc/ember.env | tail -1)
ok=0; for i in $(seq 1 30); do if curl -sf -o /dev/null "http://127.0.0.1:$NEWPORT${HP:-/}"; then ok=1; break; fi; sleep 1; done
[ "$ok" = 1 ] || { echo "new slot did not come up; live slot untouched"; journalctl -u "ember@$NEW" -n 20 --no-pager; exit 1; }

# switch nginx to the new slot (reload = no dropped connections); the site blocks include this snippet
echo "set \$ember_port $NEWPORT;" > "$SNIP"
nginx -t 2>&1 | tail -1
systemctl reload nginx
systemctl enable "ember@$NEW" >/dev/null 2>&1

# drain then stop the old slot (and the pre-blue/green unit, once)
sleep 8
if [ "$OLD" = legacy ]; then systemctl disable --now ember >/dev/null 2>&1 || true; else systemctl disable --now "ember@$OLD" >/dev/null 2>&1 || true; fi
PUB=$(sed -n "s/^NEXT_PUBLIC_APP_URL=//p" /etc/ember.env | tail -1)
echo "live slot: $NEW ($NEWPORT)  public $PUB: $(curl -s -o /dev/null -w '%{http_code}' "$PUB")"
