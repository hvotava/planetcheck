/**
 * The minimal shape a card deck needs. `PlayQuestion` (a round) and `PlayCompassQuestion`
 * (the Kompas) both satisfy it structurally, so SwipeDeck and QuestionCard serve both
 * without either knowing about the other.
 */
export type DeckOption = { id: string; key: string; text: string; icon: string | null };

export type DeckQuestion = {
  id: string;
  key: string;
  text: string;
  scenario: string | null;
  fallback_locale: string | null;
  options: DeckOption[];
  /** rounds only: the card came from the anchor library */
  anchor?: boolean;
};
