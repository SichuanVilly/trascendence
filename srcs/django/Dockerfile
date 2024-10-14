FROM python:3.12

RUN useradd --system --user-group --no-log-init --shell /bin/false django_user

WORKDIR /django

COPY --chmod=744 ./conf/requirements.txt ./

RUN pip install --root-user-action ignore --no-cache-dir -r requirements.txt

COPY --chmod=744 --chown=django_user:django_user ./conf/entrypoint.sh ./

WORKDIR /django/ft_transcendence/

COPY --chmod=744 --chown=django_user:django_user ./ft_transcendence/ ./

EXPOSE 8000

#USER django_user

ENTRYPOINT [ "/django/entrypoint.sh" ]
