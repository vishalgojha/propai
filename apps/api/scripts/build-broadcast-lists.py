import sqlite3
import json
import sys
import urllib.request
import urllib.error
import urllib.parse
import re

GOLD_DB = '/home/vishal/walearn/listings.db'

SUPABASE_URL = 'https://mnqkcctegpqxjvgdgakf.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucWtjY3RlZ3BxeGp2Z2RnYWtmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg3MzgxMiwiZXhwIjoyMDkzNDQ5ODEyfQ.OrN3VjFNJj7CFxox1nhAlV0a7OzD_poxu5F6KzK4ue4'
TENANT_ID = '796c59fb-5e34-43b9-a4b5-bf1f2c7f9ac0'

CLUSTERS = {
    'Bandra-Santacruz': [
        'bandra', 'bandra east', 'bandra west', 'khar', 'khar west',
        'santacruz', 'santacruz west', 'santacruz east',
        'vile parle', 'vile parle west', 'pali hill', 'carter road',
    ],
    'Andheri-Lokhandwala': [
        'andheri', 'andheri west', 'andheri east', 'lokhandwala',
        'oshiwara', 'versova', 'jvpd scheme', 'juhu',
    ],
    'BKC': ['bkc', 'bandra kurla complex'],
    'South Mumbai': [
        'lower parel', 'worli', 'mahalaxmi', 'prabhadevi', 'parel',
        'fort', 'marine lines', 'churchgate', 'colaba', 'nariman point',
        'tardeo', 'byculla', 'mahim',
    ],
    'Western Suburbs': [
        'goregaon west', 'goregaon east', 'malad west', 'malad east',
        'kandivali west', 'kandivali east', 'borivali west', 'borivali east',
        'dahisar', 'poisar',
    ],
    'Thane-Navi Mumbai': [
        'thane', 'navi mumbai', 'vashi', 'panvel', 'belapur',
        'airoli', 'ghansoli', 'kharghar', 'kalyan', 'dombivli',
    ],
    'Central Suburbs': [
        'dadar', 'matunga', 'sion', 'chembur', 'kurla',
        'ghatkopar', 'vikhroli', 'kanjurmarg', 'bhandup', 'mulund',
        'powai', 'nerul',
    ],
}

def normalize_locality(loc):
    return re.sub(r'\s+', ' ', loc.strip().lower())

def find_cluster(locality):
    normalized = normalize_locality(locality)
    for cluster, keywords in CLUSTERS.items():
        for keyword in keywords:
            kn = normalize_locality(keyword)
            if normalized == kn or normalized in kn or kn in normalized:
                return cluster
    return None

def supabase_request(method, path, headers_extra=None, body=None):
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    headers = {
        'Authorization': f'Bearer {SERVICE_KEY}',
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
    }
    if headers_extra:
        headers.update(headers_extra)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def delete_existing():
    print('Deleting existing broadcast contacts...')
    code, body = supabase_request('DELETE', f'wabro_contacts?tenant_id=eq.{TENANT_ID}&list_name=like.*Broadcast')
    if code == 200 or code == 204:
        print('  Done.')
    else:
        print(f'  Warning: DELETE returned {code}: {body[:200] if body else "empty"}')

def main():
    print('Opening gold database...')
    db = sqlite3.connect(GOLD_DB)
    cur = db.execute('''
        SELECT sender, phones_json, locality, all_localities_json, COUNT(*) as cnt
        FROM structured_listings
        WHERE sender IS NOT NULL AND sender != ''
          AND phones_json IS NOT NULL AND phones_json != '[]'
        GROUP BY sender
        ORDER BY cnt DESC
    ''')

    cluster_map = {}

    for row in cur.fetchall():
        sender, phones_json, locality, all_localities_json, cnt = row

        try:
            phones = json.loads(phones_json)
            if not isinstance(phones, list):
                continue
        except (json.JSONDecodeError, TypeError):
            continue

        localities = []
        if locality:
            localities.append(locality)
        try:
            all_locs = json.loads(all_localities_json or '[]')
            if isinstance(all_locs, list):
                for loc in all_locs:
                    if loc not in localities:
                        localities.append(loc)
        except (json.JSONDecodeError, TypeError):
            pass

        name = str(sender or '').strip()
        if '-' in name:
            parts = name.split('-', 1)
            name = parts[1].strip() or parts[0].strip()

        for phone in phones:
            digits = ''.join(filter(str.isdigit, str(phone)))[-10:]
            if len(digits) < 10:
                continue

            for loc in localities:
                cluster = find_cluster(loc)
                if not cluster:
                    continue
                if cluster not in cluster_map:
                    cluster_map[cluster] = {}
                phone_map = cluster_map[cluster]
                if digits in phone_map:
                    phone_map[digits]['msg_count'] += cnt
                else:
                    phone_map[digits] = {
                        'phone': digits,
                        'name': name,
                        'locality': loc,
                        'msg_count': cnt,
                    }

    db.close()

    print('\nCluster summary:')
    total = set()
    for cluster, phones in sorted(cluster_map.items()):
        print(f'  {cluster}: {len(phones)} unique phones')
        for p in phones:
            total.add(p)
    print(f'\nTotal unique phones across all clusters: {len(total)}')

    delete_existing()

    print('\nInserting in batches of 500...')
    all_rows = []
    for cluster, phones in cluster_map.items():
        list_name = f'{cluster} Broadcast'
        for phone, entry in phones.items():
            all_rows.append({
                'tenant_id': TENANT_ID,
                'list_name': list_name,
                'phone': entry['phone'],
                'name': entry['name'],
                'locality': entry['locality'],
            })

    BATCH_SIZE = 500
    total_inserted = 0
    for i in range(0, len(all_rows), BATCH_SIZE):
        batch = all_rows[i:i + BATCH_SIZE]
        code, body = supabase_request('POST', 'wabro_contacts', body=batch)
        if code < 300:
            total_inserted += len(batch)
        else:
            print(f'  Batch {i//BATCH_SIZE + 1} error HTTP {code}: {body[:200]}')
        print(f'  Progress: {total_inserted}/{len(all_rows)} inserted...')

    print(f'\nDone. Total upserted: {total_inserted}')

    print('\nFinal count per list:')
    for cluster in sorted(cluster_map.keys()):
        list_name = f'{cluster} Broadcast'
        url = f'{SUPABASE_URL}/rest/v1/wabro_contacts?tenant_id=eq.{TENANT_ID}&list_name=eq.{urllib.parse.quote(list_name)}&select=id'
        headers = {
            'Authorization': f'Bearer {SERVICE_KEY}',
            'apikey': SERVICE_KEY,
        }
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
                print(f'  {list_name}: {len(data)} contacts')
        except Exception as e:
            print(f'  {list_name}: error - {e}')

if __name__ == '__main__':
    main()
