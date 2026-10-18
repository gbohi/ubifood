// lib/features/auth/password_rules.dart

/// Caractères spéciaux acceptés par le serveur (validate_password_custom) :
/// !@#$%^&*()[]{}-_=+\|;:'",.<>?/`~
final RegExp regexCaractereSpecial =
    RegExp(r'''[!@#$%^&*()\[\]{}\-_=+\\|;:'",.<>?/`~]''');
