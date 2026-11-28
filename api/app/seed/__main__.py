from app.config import settings
from app.seed.catalogue import seed


def main() -> None:
    seed()
    print("Seed complete.")
    if settings.seed_demo_users:
        print("Demo logins (password: examsready)")
        print("  student@examsprep.local")
        print("  creator@examsprep.local")
        print("  admin@examsprep.local")
        print("  super@examsprep.local")


if __name__ == "__main__":
    main()
