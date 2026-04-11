#!/bin/sh
set -eu

export SUPERSET_CONFIG_PATH="${SUPERSET_CONFIG_PATH:-/app/pythonpath/superset_config.py}"
export SUPERSET_METADATA_DATABASE_URI="postgresql+psycopg2://${SUPERSET_DB_USER}:${SUPERSET_DB_PASSWORD}@${SUPERSET_DB_HOST}:${SUPERSET_DB_PORT}/${SUPERSET_DB_NAME}"

superset db upgrade

if ! superset fab list-users | grep -q "${SUPERSET_ADMIN_USERNAME}"; then
  superset fab create-admin \
    --username "${SUPERSET_ADMIN_USERNAME}" \
    --firstname "${SUPERSET_ADMIN_FIRSTNAME}" \
    --lastname "${SUPERSET_ADMIN_LASTNAME}" \
    --email "${SUPERSET_ADMIN_EMAIL}" \
    --password "${SUPERSET_ADMIN_PASSWORD}"
fi

superset init

python <<'PY'
import os

from superset.app import create_app

database_name = os.getenv("SUPERSET_CLICKHOUSE_DB_DISPLAY_NAME", "ClickHouse Fleet Analytics")
sqlalchemy_uri = os.environ["SUPERSET_CLICKHOUSE_URI"]

app = create_app()

with app.app_context():
    from superset.extensions import db
    from superset.models.core import Database

    database = db.session.query(Database).filter_by(database_name=database_name).one_or_none()
    if database is None:
        database = Database(
            database_name=database_name,
            sqlalchemy_uri=sqlalchemy_uri,
            expose_in_sqllab=True,
            allow_ctas=False,
            allow_cvas=False,
            allow_dml=False,
        )
        db.session.add(database)
    else:
        database.sqlalchemy_uri = sqlalchemy_uri
        database.expose_in_sqllab = True
    db.session.commit()
PY
