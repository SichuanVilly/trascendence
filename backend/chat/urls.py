from django.urls import path
from .views import ConversationView, SendMessageView

urlpatterns = [
    path('conversation/', ConversationView.as_view(), name='conversation'),
    path('send/', SendMessageView.as_view(), name='send-message'),
]
