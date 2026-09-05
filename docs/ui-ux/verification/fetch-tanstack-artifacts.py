"""Fetch pinned source/build artifacts for inspection; never install or run scripts."""
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile
import urllib.request

manifest = json.loads(Path(__file__).with_name('tanstack-artifacts.json').read_text())
root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
for package in manifest['packages']:
    blob = urllib.request.urlopen(package['tarball'], timeout=30).read()
    actual = 'sha512-' + base64.b64encode(hashlib.sha512(blob).digest()).decode()
    if actual != package['integrity']:
        raise ValueError('Integrity mismatch for ' + package['name'])
    destination = root / (package['name'].split('/')[-1] + '-' + package['version'])
    with tarfile.open(fileobj=io.BytesIO(blob), mode='r:gz') as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            relative = PurePosixPath(member.name).relative_to('package')
            if '..' in relative.parts:
                raise ValueError('Unsafe archive path')
            if not (str(relative).startswith(('src/', 'dist/')) or str(relative) == 'package.json'):
                continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
    if package['name'] == '@tanstack/devtools-event-client':
        (destination / 'plugin.mjs').write_bytes((destination / 'dist/esm/plugin.js').read_bytes())
    print(package['name'], package['version'], 'integrity verified')
