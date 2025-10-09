import { worker } from './worker';
import './externalRouter';
import { externalRouter } from './externalRouter';

export { MyDurableObject } from './worker';
export default worker.router(externalRouter).entrypoint;
