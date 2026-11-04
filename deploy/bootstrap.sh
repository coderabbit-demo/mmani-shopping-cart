#!/usr/bin/env bash
set -euo pipefail
umask 077

# All write operations require explicit root invocation on the approved VM.
mode=${1:-}
[ "$(id -u)" = 0 ] || { printf 'Root required\n' >&2; exit 1; }
command -v python3 >/dev/null || { printf 'Python 3 required\n' >&2; exit 1; }

firewall() {
  command -v iptables >/dev/null && command -v ip6tables >/dev/null || return 1
  iptables -nL DOCKER-USER >/dev/null 2>&1 || iptables -N DOCKER-USER
  iptables -C FORWARD -j DOCKER-USER 2>/dev/null || iptables -I FORWARD 1 -j DOCKER-USER
  iptables -C DOCKER-USER -i br-deskdrop ! -d 172.30.243.0/24 -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -i br-deskdrop ! -d 172.30.243.0/24 -j DROP
  iptables -C INPUT -i br-deskdrop -j DROP 2>/dev/null || iptables -I INPUT 1 -i br-deskdrop -j DROP
  ip6tables -C FORWARD -i br-deskdrop -j DROP 2>/dev/null || ip6tables -I FORWARD 1 -i br-deskdrop -j DROP
  ip6tables -C INPUT -i br-deskdrop -j DROP 2>/dev/null || ip6tables -I INPUT 1 -i br-deskdrop -j DROP
  iptables -C DOCKER-USER -i br-deskdrop ! -d 172.30.243.0/24 -j DROP
  iptables -C INPUT -i br-deskdrop -j DROP
  ip6tables -C FORWARD -i br-deskdrop -j DROP
  ip6tables -C INPUT -i br-deskdrop -j DROP
}

install_packages() {
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] && [ "$(dpkg --print-architecture)" = amd64 ] || { printf 'Ubuntu 24.04 amd64 required\n' >&2; return 1; }
  for tool in curl gpg apt-get sha256sum systemctl iptables ip6tables; do command -v "$tool" >/dev/null || return 1; done
  firewall
  temp_dir=$(mktemp -d /run/deskdrop-install.XXXXXXXX)
  trap 'rm -rf -- "$temp_dir"' EXIT
  curl --proto '=https' --proto-redir '=https' --fail --silent --show-error --location --max-time 30 https://download.docker.com/linux/ubuntu/gpg -o "$temp_dir/key.asc"
  fingerprint=$(gpg --show-keys --with-colons "$temp_dir/key.asc" | awk -F: '$1=="fpr" {print $10; exit}')
  [ "$fingerprint" = 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ] || { printf 'Docker signing key mismatch\n' >&2; return 1; }
  gpg --dearmor < "$temp_dir/key.asc" > "$temp_dir/docker.gpg"
  install -d -m 0755 /etc/apt/keyrings
  install -m 0644 "$temp_dir/docker.gpg" /etc/apt/keyrings/deskdrop-docker.gpg
  printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/deskdrop-docker.gpg] https://download.docker.com/linux/ubuntu noble stable' > /etc/apt/sources.list.d/deskdrop-docker.list
  apt-get -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false update
  (cd "$temp_dir" && apt-get -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false download 'docker-ce=5:29.9.3-1~ubuntu.24.04~noble' 'docker-ce-cli=5:29.9.3-1~ubuntu.24.04~noble' 'containerd.io=2.4.2-3~ubuntu.24.04~noble' 'docker-buildx-plugin=0.38.1-1~ubuntu.24.04~noble' 'docker-compose-plugin=5.7.0-1~ubuntu.24.04~noble')
  for entry in     'docker-ce c546181f0bc5f1d19085d764a3219aa86069468dbee4743fae420ee8a31809a4'     'docker-ce-cli 24f78a893cece8d345c4e90b5163907c047b996b747265f873743e8b0b0546d4'     'containerd.io f811ab57d1f4bb0cce19df7d526da8c711d8ebea0447cc83da1999188e664122'     'docker-buildx-plugin 642e9a8a0d115a8a57ad7045a4c7c2561522331197f0c087a762de1b72591672'     'docker-compose-plugin 61dd23ec4d0f6e4a99ef841f2ea2c0dc9cbada2c6ad99ffbd4f980ae957cc691'; do
    read -r package digest <<< "$entry"
    matches=("$temp_dir"/"$package"_*.deb)
    [ "${#matches[@]}" -eq 1 ] && [ -f "${matches[0]}" ] || return 1
    printf '%s  %s\n' "$digest" "${matches[0]}" | sha256sum -c -
  done
  DEBIAN_FRONTEND=noninteractive apt-get -o APT::Get::AllowUnauthenticated=false install --no-install-recommends -y "$temp_dir"/*.deb
  firewall
  install -d -m 0700 /opt/deskdrop /etc/deskdrop
  cat > /etc/systemd/system/deskdrop-firewall.service <<'UNIT'
[Unit]
Description=DeskDrop container isolation
Wants=network-online.target
After=network-online.target
Before=docker.service
[Service]
Type=oneshot
ExecStart=/opt/deskdrop/bootstrap.sh firewall
RemainAfterExit=yes
[Install]
RequiredBy=docker.service
UNIT
  cat > /etc/systemd/system/deskdrop.service <<'UNIT'
[Unit]
Description=DeskDrop private demo
Requires=docker.service deskdrop-firewall.service
After=docker.service deskdrop-firewall.service network-online.target
[Service]
Type=oneshot
ExecStart=/opt/deskdrop/bootstrap.sh restart
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable deskdrop-firewall.service deskdrop.service
}

case "$mode" in
  install) [ "$#" -eq 1 ] || exit 2; "${BASH_SOURCE[0]}" verify; install_packages; exit ;;
  firewall) [ "$#" -eq 1 ] || exit 2; firewall; if [ -f /etc/deskdrop/release ]; then "${BASH_SOURCE[0]}" secret-refresh; fi; exit ;;
  secret-refresh) [ "$#" -eq 1 ] || exit 2 ;;
  verify) [ "$#" -eq 1 ] || exit 2 ;;
  start|restart|check)
    if [ "$mode" = start ]; then
      [ "$#" -eq 4 ] || exit 2
      app_image=$2 checker_image=$3 source_commit=$4
    else
      [ "$#" -eq 1 ] || exit 2
      release=/etc/deskdrop/release
      [ -f "$release" ] && [ ! -L "$release" ] && [ "$(stat -c '%u:%a:%h' "$release")" = '0:600:1' ] || { printf 'Unsafe release file\n' >&2; exit 1; }
      mapfile -t release_values < "$release"
      [ "${#release_values[@]}" -eq 3 ] || exit 1
      app_image=${release_values[0]} checker_image=${release_values[1]} source_commit=${release_values[2]}
    fi
    [[ $app_image =~ ^us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/deskdrop@sha256:[a-f0-9]{64}$ ]] || exit 2
    [[ $checker_image =~ ^us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/checker@sha256:[a-f0-9]{64}$ ]] || exit 2
    [[ $source_commit =~ ^[a-f0-9]{40}$ ]] || exit 2
    "${BASH_SOURCE[0]}" verify
    firewall
    if [ "$mode" != check ]; then
      /opt/deskdrop/bootstrap.sh host-auth "$app_image" "$checker_image" "$source_commit"
      printf '%s\n%s\n%s\n' "$app_image" "$checker_image" "$source_commit" > /etc/deskdrop/release.tmp
      chmod 0600 /etc/deskdrop/release.tmp
      mv -f /etc/deskdrop/release.tmp /etc/deskdrop/release
      APP_IMAGE=$app_image CHECKER_IMAGE=$checker_image SOURCE_COMMIT=$source_commit docker compose -f /opt/deskdrop/compose.yaml up -d --force-recreate app agent
    else
      [ "$(docker inspect --format '{{.Config.Image}}' deskdrop-app-1)" = "$app_image" ] || { printf 'Deployed image mismatch\n' >&2; exit 1; }
      APP_IMAGE=$app_image CHECKER_IMAGE=$checker_image SOURCE_COMMIT=$source_commit docker compose -f /opt/deskdrop/compose.yaml --profile check run --rm checker
    fi
    exit ;;
  host-auth) [ "$#" -eq 4 ] || exit 2 ;;
  *) printf 'Expected install, firewall, or host-auth\n' >&2; exit 2 ;;
esac
exec python3 - "$mode" "${@:2}" <<'PYCODE'
import base64
import json
import os
import re
import resource
import stat
import subprocess
import tempfile
import sys
import urllib.error
import urllib.request

PROJECT = 'se-demos-project'
ZONE = 'us-central1-a'
INSTANCE = 'deskdrop-demo'
SERVICE_ACCOUNT = 'deskdrop-demo-runtime@se-demos-project.iam.gserviceaccount.com'
REGISTRY = 'us-central1-docker.pkg.dev'
META = 'http://metadata.google.internal/computeMetadata/v1/'
SECRET = 'https://secretmanager.googleapis.com/v1/projects/se-demos-project/secrets/deskdrop-datadog-intake/versions/latest:access'
LIMIT = 32768

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('redirect rejected')


def fetch(opener, url, headers):
    request = urllib.request.Request(url, headers=headers, method='GET')
    with opener.open(request, timeout=5) as response:
        if response.status != 200:
            raise ValueError('request failed')
        body = response.read(LIMIT + 1)
        if len(body) > LIMIT:
            raise ValueError('response too large')
        if url.startswith(META) and response.headers.get('Metadata-Flavor') != 'Google':
            raise ValueError('invalid metadata response')
        return body


def verify_identity(opener):
    headers = {'Metadata-Flavor': 'Google'}
    expected = {'project/project-id': PROJECT, 'instance/name': INSTANCE, 'instance/zone': ZONE, 'instance/service-accounts/default/email': SERVICE_ACCOUNT}
    for path, wanted in expected.items():
        actual = fetch(opener, META + path, headers).decode().strip()
        if path == 'instance/zone':
            if not re.fullmatch(r'projects/[0-9]+/zones/' + ZONE, actual):
                raise ValueError('wrong zone')
        elif actual != wanted:
            raise ValueError('wrong runtime identity')


def runtime_identity(opener):
    verify_identity(opener)
    headers = {'Metadata-Flavor': 'Google'}
    token = json.loads(fetch(opener, META + 'instance/service-accounts/default/token', headers))['access_token']
    if not isinstance(token, str) or not token or len(token) > 8192 or '\n' in token:
        raise ValueError('invalid token')
    return token


def acquire(opener):
    token = runtime_identity(opener)
    response = json.loads(fetch(opener, SECRET, {'Authorization': 'Bearer ' + token}))
    secret = base64.b64decode(response['payload']['data'], validate=True)
    if not re.fullmatch(rb'[A-Za-z0-9]{32}', secret):
        raise ValueError('invalid intake key')
    return token, secret


def save_secret(path, secret, owner=0):
    directory = os.path.dirname(path)
    st = os.stat(directory, follow_symlinks=False)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != owner or stat.S_IMODE(st.st_mode) != 0o700:
        raise ValueError('unsafe runtime directory')
    try:
        prior = os.lstat(path)
    except FileNotFoundError:
        prior = None
    if prior is not None:
        if not stat.S_ISREG(prior.st_mode) or prior.st_uid != owner or stat.S_IMODE(prior.st_mode) != 0o600 or prior.st_nlink != 1:
            raise ValueError('unsafe secret file')
        os.unlink(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != owner or stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1:
            raise ValueError('unsafe secret file')
        with os.fdopen(fd, 'wb', closefd=False) as f:
            f.write(secret)
            f.flush()
    finally:
        os.close(fd)


def validate_images(images):
    patterns = [r'us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/deskdrop@sha256:[a-f0-9]{64}', r'us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/checker@sha256:[a-f0-9]{64}']
    if len(images) != 2 or any(not re.fullmatch(pattern, image) for pattern, image in zip(patterns, images)):
        raise ValueError('wrong image')


def pull_images(token, images, source, runner=subprocess.run):
    validate_images(images)
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('wrong source')
    with tempfile.TemporaryDirectory(prefix='registry-', dir='/run/deskdrop') as config:
        os.chmod(config, 0o700)
        env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'DOCKER_CONFIG': config}
        opts = {'env': env, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL, 'timeout': 120, 'check': True}
        runner(['docker', 'login', '--username', 'oauth2accesstoken', '--password-stdin', REGISTRY], input=token.encode(), **opts)
        for image in images:
            runner(['docker', 'pull', '--platform', 'linux/amd64', image], **opts)
            with tempfile.TemporaryFile(dir=config) as output:
                limit = lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (4096, 4096))
                runner(['docker', 'image', 'inspect', '--format={{.Architecture}}|{{index .Config.Labels "org.opencontainers.image.revision"}}', image], env=env, stdout=output, stderr=subprocess.DEVNULL, timeout=15, check=True, preexec_fn=limit)
                output.seek(0)
                if output.read(4097).decode().strip() != 'amd64|' + source:
                    raise ValueError('image identity mismatch')


def main():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    if sys.argv[1] == 'verify':
        verify_identity(opener)
        return
    if sys.argv[1] == 'secret-refresh':
        os.makedirs('/run/deskdrop', mode=0o700, exist_ok=True)
        token, secret = acquire(opener)
        save_secret('/run/deskdrop/intake', secret)
        del token, secret
        return
    images, source = sys.argv[2:4], sys.argv[4]
    validate_images(images)
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('wrong source')
    os.makedirs('/run/deskdrop', mode=0o700, exist_ok=True)
    token, secret = acquire(opener)
    save_secret('/run/deskdrop/intake', secret)
    pull_images(token, images, source)
    del token, secret

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Runtime authentication failed', file=sys.stderr)
        sys.exit(1)
PYCODE
