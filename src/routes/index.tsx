import { createFileRoute } from "@tanstack/react-router";
import { Provider } from "react-redux";
import { store } from "@/store";
import { HebrewShinGame } from "@/components/HebrewShinGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "הגיית האות ש · Hebrew Shin Trainer" },
      {
        name: "description",
        content:
          "אימון הגייה בעברית עבור האות ש עם זיהוי דיבור, הקלטות והשמעה מודגשת.",
      },
      { property: "og:title", content: "Hebrew Shin Pronunciation Trainer" },
      {
        property: "og:description",
        content: "Practice pronouncing the Hebrew letter ש with speech recognition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <Provider store={store}>
      <HebrewShinGame />
    </Provider>
  );
}
