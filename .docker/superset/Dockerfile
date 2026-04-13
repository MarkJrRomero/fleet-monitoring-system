FROM apache/superset:4.0.2

USER root

RUN pip install --no-cache-dir \
    clickhouse-connect \
    'clickhouse-sqlalchemy<0.3' \
    psycopg2-binary

RUN mkdir -p /app/pythonpath

COPY superset_init.sh /app/superset_init.sh
COPY superset_config.py /app/pythonpath/superset_config.py

RUN chmod +x /app/superset_init.sh && chown -R superset:superset /app

USER superset
