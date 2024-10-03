#!/bin/bash

python manage.py collectstatic --noinput
python manage.py createadmin --password ${DJANGO_ADMIN_PASSWORD_FILE} --username ${DJANGO_ADMIN_USER_FILE} --email ${DJANGO_ADMIN_EMAIL_FILE}
python manage.py runserver 0.0.0.0:8000
