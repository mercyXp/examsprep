import unittest

from app.quizzes import Choice, GradedQuestion, grade_question, grade_questions, percent_score


def question(**kwargs: object) -> GradedQuestion:
    base = dict(
        question_version_id="q1",
        points=2,
        correct_ids=frozenset({"b"}),
        prompt="Which phase writes the specification?",
        explanation="Analysis produces the requirements specification.",
        choices=(Choice("a", "Design"), Choice("b", "Analysis")),
        kind="mcq",
        accepted=(),
        model_answer="",
    )
    base.update(kwargs)
    return GradedQuestion(**base)  # type: ignore[arg-type]


class GradingTests(unittest.TestCase):
    def test_multiple_choice_and_true_false_need_the_stored_option(self) -> None:
        mcq = question()
        wrong, _, _ = grade_questions([mcq], {"q1": ["a"]})
        right, earned, possible = grade_questions([mcq], {"q1": ["b"]})
        self.assertFalse(wrong[0].correct)
        self.assertEqual(wrong[0].points_awarded, 0)
        self.assertTrue(right[0].correct)
        self.assertEqual(earned, 2)
        self.assertEqual(possible, 2)
        true_false = question(
            kind="true_false",
            correct_ids=frozenset({"true"}),
            choices=(Choice("true", "True"), Choice("false", "False")),
        )
        marked = grade_question(true_false, [], "true")
        self.assertTrue(marked.correct)
        self.assertEqual(marked.selected_option_ids, ("true",))

    def test_short_answers_ignore_case_and_punctuation(self) -> None:
        short = question(
            kind="short",
            points=1,
            correct_ids=frozenset(),
            choices=(),
            accepted=("feasibility study",),
            model_answer="Feasibility study",
        )
        marked = grade_question(short, [], "  Feasibility, study ")
        self.assertTrue(marked.correct)
        missed = grade_question(short, [], "design")
        self.assertFalse(missed.correct)

    def test_structured_answers_award_partial_credit_for_key_points(self) -> None:
        structured = question(
            kind="structured",
            points=4,
            correct_ids=frozenset(),
            choices=(),
            accepted=("corrective maintenance", "adaptive maintenance"),
            model_answer="Corrective maintenance fixes faults. Adaptive maintenance responds to change.",
        )
        partial = grade_question(structured, [], "The team scheduled corrective maintenance after the outage.")
        self.assertFalse(partial.correct)
        self.assertEqual(partial.points_awarded, 2)
        self.assertEqual(partial.key_points_matched, 1)
        full = grade_question(
            structured,
            [],
            "Corrective maintenance fixes faults and adaptive maintenance responds to a new regulation.",
        )
        self.assertTrue(full.correct)
        self.assertEqual(full.points_awarded, 4)
        empty = question(kind="structured", points=4, correct_ids=frozenset(), choices=(), accepted=())
        skipped = grade_question(empty, [], "anything")
        self.assertEqual(skipped.points_awarded, 0)

    def test_percent_rounds_half_up(self) -> None:
        self.assertEqual(percent_score(1, 3), 33)
        self.assertEqual(percent_score(0, 0), 0)


if __name__ == "__main__":
    unittest.main()
