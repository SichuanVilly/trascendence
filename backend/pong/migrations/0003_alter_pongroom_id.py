# Generated by Django 5.1.6 on 2025-02-24 19:17

import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pong', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='pongroom',
            name='id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True),
        ),
    ]
