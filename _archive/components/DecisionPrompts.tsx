import { calculateSearchProbability } from '@/lib/lostPersonModel';

export default function DecisionPrompts() {
  const prob = calculateSearchProbability(30, 'forest', 2);

  return (
    <div>
      <p>Next Action Prompts</p>
      <ul>
        <li>Deploy team to high-probability area (Probability: {prob * 100}%)</li>
        <li>Check weather conditions</li>
        <li>Update incident log</li>
      </ul>
    </div>
  );
}