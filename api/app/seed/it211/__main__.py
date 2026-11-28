"""Load the published IT211 course.

Safe to run more than once, including against production. It only upserts the
Bachelor of Science in Computing programme's IT211 module, its chapters,
lessons, topics, and quizzes. It does not delete or edit other programmes,
modules, users, or attempts.

A demo student is created only when SEED_DEMO_USERS=true and both
DEMO_STUDENT_EMAIL and DEMO_STUDENT_PASSWORD are set. The password is never
written into the repository.
"""

from app.seed.it211.load import seed_it211


def main() -> None:
    seed_it211()


if __name__ == "__main__":
    main()
