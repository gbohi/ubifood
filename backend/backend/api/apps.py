from django.apps import AppConfig

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        import api.signals  # ← charge les signaux existants
        from .fcm_service import init_firebase
        try:
            init_firebase()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"⚠️ Firebase non initialisé : {e}"
            )