// Kilo-specific translations and overrides
// Keys here will override any matching keys from upstream translations
export const dict = {
  // Kilo Gateway provider translations
  "provider.connect.kiloGateway.line1":
    "Kilo Gateway vám poskytuje prístup k pozornosťou vybranému súboru spoľahlivých optimalizovaných modelov pre kódovacie agenty.",
  "provider.connect.kiloGateway.line2":
    "S jedným API kľúčom získate prístup k modelom ako Claude, GPT, Gemini, GLM a ďalším.",
  "provider.connect.kiloGateway.visit.prefix": "Navštívte ",
  "provider.connect.kiloGateway.visit.link": "kilo.ai",
  "provider.connect.kiloGateway.visit.suffix": " aby ste získali svoj API kľúč.",

  // Provider dialog translations
  "dialog.provider.group.recommended": "Odporúčané",
  "dialog.provider.kilo.note": "Prístup ku 500+ AI modelom",

  // Reasoning block label
  "ui.permission.run": "Spustiť",
  "ui.reasoning.label": "Rozumové procesy",

  // Marketplace
  "marketplace.tab.skills": "Schopnosti",
  "marketplace.tab.mcpServers": "MCP servery",
  "marketplace.tab.modes": "Režimy",
  "marketplace.category.all": "Všetko",
  "marketplace.placeholder": "Bude implementované",
  "marketplace.card.installed": "Nainštalované",
  "marketplace.card.install": "Inštalovať",
  "marketplace.card.remove": "Odstrániť",
  "marketplace.card.removeScope": "Odstrániť ({{scope}})",
  "marketplace.card.showMore": "Zobraziť viac",
  "marketplace.card.showLess": "Zobraziť menej",
  "marketplace.install.title": "Inštalovať {{name}}",
  "marketplace.install.scope": "Rozsah",
  "marketplace.install.scope.project": "Projekt",
  "marketplace.install.scope.global": "Globálne",
  "marketplace.install.prerequisites": "Predpoklady",
  "marketplace.install.installing": "Inštaluje sa...",
  "marketplace.install.cancel": "Zrušiť",
  "marketplace.install.success": "Úspešne nainštalované!",
  "marketplace.install.failed": "Inštalácia zlyhala",
  "marketplace.install.done": "Hotovo",
  "marketplace.install.close": "Zatvoriť",
  "marketplace.remove.title": "Odstrániť {{name}}?",
  "marketplace.remove.confirm":
    "Ste si istý, že chcete odstrániť tento {{type}}? Tým sa odstráni z vašej {{scope}} konfigurácie.",
  "marketplace.remove.cancel": "Zrušiť",
  "marketplace.remove.confirm.button": "Odstrániť",
  "marketplace.tab.mcp": "MCP",
  "marketplace.search": "Hľadať...",
  "marketplace.filter.all": "Všetky položky",
  "marketplace.filter.notInstalled": "Nie je nainštalované",
  "marketplace.empty": "Neboli nájdené žiadne položky",
  "marketplace.badge.mcpServer": "MCP server",
  "marketplace.badge.mode": "Režim",
  "marketplace.card.by": "od {{author}}",
  "marketplace.install.method": "Metóda inštalácie",
  "marketplace.install.parameters": "Parametre",
  "marketplace.install.optional": "(voliteľné)",
  "marketplace.install.required": "{{name}} je povinné",
  "marketplace.scope.project": "projekt",
  "marketplace.scope.global": "globálny",
  "marketplace.remove.type.mcp": "MCP server",
  "marketplace.remove.type.skill": "schopnosť",
  "marketplace.remove.type.mode": "režim",
  "marketplace.remove.failed": "Odstránenie {{name}} zlyhalo",
  "marketplace.install": "Inštalovať",
  "marketplace.filter.installed": "Nainštalované",
  "marketplace.error.dismiss": "Zrušiť",
  "marketplace.warning.busyOne": "Jedna relácia beží a bude prerušená",
  "marketplace.warning.busyMany": "Niekoľko relácií beží a budú prerušené",
  "marketplace.warning.installAnyway": "Napriek tomu inštalovať",
  "marketplace.warning.cancel": "Zrušiť",
  "marketplace.contribute.prompt": "Chýba vám schopnosť, režim alebo MCP server?",
  "marketplace.contribute.cta": "Prispieť na GitHub-e",

  // Plan follow-up question shown after plan_exit. The English strings here must match
  // the canonical `label`/`header`/`question` sent by the backend — those canonical labels
  // are still what the backend matches on (see packages/opencode/src/kilocode/plan-followup.ts).
  "plan.followup.header": "Implementovať",
  "plan.followup.question": "Pripravený na implementáciu?",
  "plan.followup.answer.newSession": "Spustiť novú reláciu",
  "plan.followup.answer.newSession.description": "Implementovať v novej relácii s čistým kontextom",
  "plan.followup.answer.continue": "Pokračovať tu",
  "plan.followup.answer.continue.description": "Implementovať plán v tejto relácii",

  // Slow-repo snapshot prompt. The English strings here are the canonical
  // labels sent by the backend and must stay in sync with
  // packages/opencode/src/kilocode/snapshot/track.ts.
  "snapshot.slowRepo.header": "Snapshot je pomalý",
  "snapshot.slowRepo.question":
    "Inicializácia systému snapshotov trvá dlho, pravdepodobne kvôli veľkosti repozitára.\n\nChcete vypnúť Snapshots pre tento repozitár?",
  "snapshot.slowRepo.answer.continue": "Pokračovať so snapshotmi",
  "snapshot.slowRepo.answer.continue.description":
    "Počkať, kým sa snapshot dokončí. Následné otáčky sú rýchle, keď je vytvorený počiatočný snapshot.",
  "snapshot.slowRepo.answer.disable": "Vypnúť pre tento projekt",
  "snapshot.slowRepo.answer.disable.description":
    "Vypnúť Kilo snapshoty pre tento projekt. Stratíte undo/redo zmien Kilo, ale git stále sleduje všetko.",

  // Edit-tool header: hover-revealed action opening the diff in a full tab.
  "ui.messagePart.openInDiffViewer": "Otvoriť v prehliadači rozdielov",
  // Shell-tool section labels and actions.
  "ui.messagePart.shell.command": "Príkaz",
  "ui.messagePart.shell.output": "Výstup",
  "ui.messagePart.openInEditor": "Otvoriť v editore",

  // Message feedback (thumbs up/down per assistant response)
  "ui.message.feedback.helpful": "Toto bolo užitočné",
  "ui.message.feedback.notHelpful": "Toto nebolo užitočné",
  "ui.message.feedback.clearRating": "Vyčistiť hodnotenie",
}
