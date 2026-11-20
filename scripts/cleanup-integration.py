"""Remove only the order and session identified by the local integration run."""
import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from coffee.models import CustomerSession, Order

artifact = root / 'output' / 'test-artifacts' / 'integration-cleanup.json'
data = json.loads(artifact.read_text(encoding='utf-8'))
ids = data.get('orderIds') or [data['orderId']]
Order.objects.filter(pk__in=ids, customer__token=data['token'], note='INTEGRATION_CHECK_ONLY').delete()
CustomerSession.objects.filter(token=data['token'], order__isnull=True).delete()
artifact.unlink()
print('Removed the isolated integration orders and their unused device session.')
