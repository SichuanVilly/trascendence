# Generated by Django 4.2.19 on 2025-03-21 23:03

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('pong', '0007_matchhistory_player1_matchhistory_player2_and_more'),
    ]

    operations = [
        migrations.DeleteModel(
            name='MatchHistory',
        ),
    ]
