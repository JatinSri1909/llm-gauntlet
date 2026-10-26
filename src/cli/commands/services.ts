import type { Services } from '../../app/services.js';

let servicesFactory: () => Promise<Services> = async () => {
  const { createServices } = await import('../../app/services.js');
  return createServices();
};

/** Set the factory that makes the services. Tests replace it. */
export function setServicesFactory(factory: () => Promise<Services>): void {
  servicesFactory = factory;
}

/** Make the services for one command run. */
export async function withServices<T>(action: (services: Services) => Promise<T>): Promise<T> {
  const services = await servicesFactory();
  try {
    return await action(services);
  } finally {
    services.close();
  }
}
