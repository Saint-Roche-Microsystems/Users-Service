/** Token de inyección del cliente ioredis compartido, definido fuera de RedisModule
 * para que consumidores en otros módulos puedan referenciarlo sin importar la clase. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
