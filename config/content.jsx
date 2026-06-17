// Active letter's rich page content (JSX). Imported only by the frontend
// (src/App.jsx). Selection mirrors config/letter.config.js via LETTER_CONFIG.

import * as gehaltsdeckel from "./letters/gehaltsdeckel/content.jsx";
import * as example from "./letters/example/content.jsx";
import { activeLetterName } from "./active-letter.js";

const CONTENT = {
  gehaltsdeckel,
  example,
};

const name = activeLetterName();
const active = CONTENT[name] || gehaltsdeckel;

export const LetterArticle = active.LetterArticle;
export const FaqContent = active.FaqContent;
