import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils.timezone import now

class Command(BaseCommand):
    def add_arguments(self, parser):
        parser.add_argument('--password')
        parser.add_argument('--username')
        parser.add_argument('--email')

    def handle(self, *args, **options):
        User = get_user_model()

        options['password'] = open(os.environ.get('DJANGO_ADMIN_PASSWORD_FILE')).read()[:-1]
        options['username'] = open(os.environ.get('DJANGO_ADMIN_USER_FILE')).read()[:-1]
        options['email'] = open(os.environ.get('DJANGO_ADMIN_EMAIL_FILE')).read()[:-1]

        if not User.objects.filter(username=options['username']).exists():
            User.objects.create_superuser(password=options['password'], username=options['username'], email=options['email'], last_login=now())
