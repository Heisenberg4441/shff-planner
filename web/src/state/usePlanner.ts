import { useContext } from 'react';

import { PlannerContext } from './PlannerProvider';
import type { PlannerContextValue } from './PlannerProvider';

export function usePlanner(): PlannerContextValue {
  const value = useContext(PlannerContext);
  if (!value) throw new Error('usePlanner вызван вне PlannerProvider');
  return value;
}
