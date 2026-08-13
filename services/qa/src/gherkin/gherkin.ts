/**
 * Minimal Gherkin (Given/When/Then) parser — enough to connect a business
 * requirement ticket to an executable-shaped test case, per the original
 * spec's BDD requirement. Deliberately not a full Gherkin implementation
 * (no Scenario Outline/Examples tables, no Background, no data tables) —
 * those are a real extension point once a test-runner actually executes
 * these scenarios rather than just displaying them structured.
 */
export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
}

export interface ParsedScenario {
  title: string;
  steps: GherkinStep[];
}

const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'] as const;

export function parseGherkin(source: string): ParsedScenario {
  const lines = source.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = '';
  const steps: GherkinStep[] = [];

  for (const line of lines) {
    const scenarioMatch = line.match(/^Scenario:\s*(.+)$/);
    if (scenarioMatch) {
      title = scenarioMatch[1];
      continue;
    }
    const stepMatch = STEP_KEYWORDS.find((kw) => line.startsWith(kw + ' '));
    if (stepMatch) {
      steps.push({ keyword: stepMatch, text: line.slice(stepMatch.length + 1).trim() });
    }
  }

  return { title, steps };
}
