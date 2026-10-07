from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """
    Pagination par défaut de l'API.
    Le client peut demander jusqu'à 1000 éléments par page avec ?page_size=N
    (utilisé par le mobile pour les menus, tarifs et allergies).
    """
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 1000
