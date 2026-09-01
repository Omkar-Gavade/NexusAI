import { ModelsResponse } from '@nexusai/contracts';
import { json } from '@/lib/http';

export function fetchModels() {
  return json('/models', ModelsResponse);
}
