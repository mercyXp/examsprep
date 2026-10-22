import unittest

from app.course_selection import (
    ACTIVE_LIMIT,
    CatalogueModule,
    CourseSelectionError,
    add_code,
    default_codes,
    remove_code,
)


class CourseSelectionTests(unittest.TestCase):
    def test_students_can_combine_modules_from_different_years(self) -> None:
        allowed = {"IT114", "IT212", "IT216"}
        active, history = add_code([], [], "IT114", allowed)
        active, history = add_code(active, history, "IT212", allowed)
        active, history = add_code(active, history, "IT216", allowed)
        self.assertEqual(active, ["IT114", "IT212", "IT216"])
        self.assertEqual(history, [])

    def test_the_eighth_module_is_refused(self) -> None:
        active = [f"IT20{index}" for index in range(ACTIVE_LIMIT)]
        allowed = set(active) | {"IT216"}
        with self.assertRaises(CourseSelectionError) as caught:
            add_code(active, [], "IT216", allowed)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(active), 7)

    def test_a_module_outside_the_programme_is_refused(self) -> None:
        with self.assertRaises(CourseSelectionError) as caught:
            add_code([], [], "LAW101", {"IT211"})
        self.assertEqual(caught.exception.status_code, 404)

    def test_removing_a_module_keeps_it_in_history_and_readding_clears_that_entry(self) -> None:
        active, history = remove_code(["IT211", "IT212"], [], "IT211")
        self.assertEqual(active, ["IT212"])
        self.assertEqual(history, ["IT211"])
        active, history = add_code(active, history, "IT211", {"IT211", "IT212"})
        self.assertEqual(active, ["IT212", "IT211"])
        self.assertNotIn("IT211", history)

    def test_initial_suggestions_follow_year_and_semester_and_stop_at_seven(self) -> None:
        modules = [CatalogueModule(code=f"Y1-{index}", year=1, semester=1) for index in range(8)]
        modules.append(CatalogueModule(code="Y2-1", year=2, semester=2))
        chosen = default_codes(modules, year=1, semester=1)
        self.assertEqual(len(chosen), 7)
        self.assertTrue(all(code.startswith("Y1-") for code in chosen))
        self.assertNotIn("Y2-1", chosen)
