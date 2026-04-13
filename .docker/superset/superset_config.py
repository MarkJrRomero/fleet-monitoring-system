import os

SECRET_KEY = os.getenv("SUPERSET_SECRET_KEY", "fleet-monitoring-superset-secret")
SQLALCHEMY_DATABASE_URI = os.getenv(
    "SUPERSET_METADATA_DATABASE_URI",
    "postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}".format(
        user=os.getenv("SUPERSET_DB_USER", "superset"),
        password=os.getenv("SUPERSET_DB_PASSWORD", "superset"),
        host=os.getenv("SUPERSET_DB_HOST", "superset-db"),
        port=os.getenv("SUPERSET_DB_PORT", "5432"),
        database=os.getenv("SUPERSET_DB_NAME", "superset_metadata"),
    ),
)
MAPBOX_API_KEY = os.getenv("MAPBOX_API_KEY", "")
WTF_CSRF_ENABLED = True
TALISMAN_ENABLED = False
FEATURE_FLAGS = {
    "ENABLE_TEMPLATE_PROCESSING": True,
}
