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
order = Order.objects.filter(pk=data['orderId'], customer__token=data['token'], note='INTEGRATION_CHECK_ONLY').first()
if order:
    order.delete()
CustomerSession.objects.filter(token=data['token'], order__isnull=True).delete()
artifact.unlink()
print('Removed the isolated integration order and its unused device session.')
