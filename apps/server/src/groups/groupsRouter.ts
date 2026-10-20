import { GROUPS_MAX_PER_HOST, groupIdParamsSchema, groupSaveSchema } from '@quizup/shared';
import { Router } from 'express';
import { createRequireAuth, getAuthUser, requireRole, type AccessTokenVerifier } from '../auth.js';
import { asyncRoute, parseOrReject, sendNotFound } from '../http.js';
import type { GroupRepository } from './groupRepository.js';

export function createGroupsRouter(dependencies: {
  verifier: AccessTokenVerifier;
  repository: GroupRepository;
}): Router {
  const { verifier, repository } = dependencies;
  const router = Router();

  router.use(createRequireAuth(verifier), requireRole('host', 'admin'));

  router.get(
    '/',
    asyncRoute(async (request, response) => {
      response.json(await repository.list(getAuthUser(request).id));
    }),
  );

  router.post(
    '/',
    asyncRoute(async (request, response) => {
      const body = parseOrReject(groupSaveSchema, request.body, response);
      if (!body) {
        return;
      }
      const hostId = getAuthUser(request).id;
      if ((await repository.list(hostId)).length >= GROUPS_MAX_PER_HOST) {
        response.status(409).json({ error: `You can keep up to ${GROUPS_MAX_PER_HOST} groups` });
        return;
      }
      const saved = await repository.save(hostId, null, body);
      if (saved === 'name_taken') {
        response.status(409).json({ error: 'You already have a group with that name' });
        return;
      }
      const created = await repository.get(hostId, saved);
      response.status(201).json(created);
    }),
  );

  router.get(
    '/:groupId',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(groupIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      const group = await repository.get(getAuthUser(request).id, params.groupId);
      if (!group) {
        sendNotFound(response, 'Group');
        return;
      }
      response.json(group);
    }),
  );

  router.put(
    '/:groupId',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(groupIdParamsSchema, request.params, response);
      const body = params ? parseOrReject(groupSaveSchema, request.body, response) : null;
      if (!params || !body) {
        return;
      }
      const hostId = getAuthUser(request).id;
      const saved = await repository.save(hostId, params.groupId, body);
      if (saved === 'not_found') {
        sendNotFound(response, 'Group');
        return;
      }
      if (saved === 'name_taken') {
        response.status(409).json({ error: 'You already have a group with that name' });
        return;
      }
      response.json(await repository.get(hostId, saved));
    }),
  );

  router.delete(
    '/:groupId',
    asyncRoute(async (request, response) => {
      const params = parseOrReject(groupIdParamsSchema, request.params, response);
      if (!params) {
        return;
      }
      if (!(await repository.remove(getAuthUser(request).id, params.groupId))) {
        sendNotFound(response, 'Group');
        return;
      }
      response.status(204).end();
    }),
  );

  return router;
}
