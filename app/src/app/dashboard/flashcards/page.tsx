import EmptyFeature from "@/app/components/dashboard/EmptyFeature";

export const metadata = { title: "Flashcards — ExamsPrep" };

export default function FlashcardsPage() {
  return (
    <EmptyFeature
      title="Flashcards"
      summary="Deck review is ready as a destination, without placeholder decks."
      detail="No flashcard decks have been published yet. This page will list decks attached to your modules when they exist."
    />
  );
}
