/*
 * Entrée navigateur. Pendant du CLI : seul module à effets de bord côté web
 * (DOM, lecture des fichiers déposés, téléchargement). Toute la logique de
 * génération vit dans `src/qr.ts` et `src/render.ts`, tous deux purs.
 */

import { buildVariants, renderVariant } from "../src/qr.js";
import { DEFAULT_RENDER_OPTS } from "../src/render.js";

const variants = buildVariants("https://collecti-frog.fr", DEFAULT_RENDER_OPTS);
const preview = document.querySelector("#preview");
if (preview !== null) {
  preview.innerHTML = renderVariant(variants[0], DEFAULT_RENDER_OPTS);
}
