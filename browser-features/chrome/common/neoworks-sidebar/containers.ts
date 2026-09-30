// SPDX-License-Identifier: MPL-2.0

// Firefox containers (contextual identities) plus the Neoworks default
// container that new tabs open in.

import { createSignal } from "solid-js";

interface ContextualIdentity {
  userContextId: number;
  icon: string;
  color: string;
}

export const { ContextualIdentityService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
) as {
  ContextualIdentityService: {
    getPublicIdentities(): ContextualIdentity[];
    getPublicIdentityFromId(userContextId: number): ContextualIdentity | null;
    getUserContextLabel(userContextId: number): string;
    create(name: string, icon: string, color: string): ContextualIdentity;
    update(userContextId: number, name: string, icon: string, color: string): boolean;
    remove(userContextId: number): boolean;
    closeContainerTabs(userContextId: number): Promise<void>;
  };
};

export interface Container {
  userContextId: number;
  name: string;
  icon: string;
  color: string;
}

export const NO_CONTAINER = 0;

// Firefox's container palette, in the order new containers cycle through.
export const CONTAINER_COLORS = [
  "blue",
  "turquoise",
  "green",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
];

const DEFAULT_CONTAINER_PREF = "neoworks.containers.default";
const NEW_CONTAINER_ICON = "fingerprint";
const IDENTITY_TOPICS = [
  "contextual-identity-created",
  "contextual-identity-updated",
  "contextual-identity-deleted",
];

function readContainers(): Container[] {
  return ContextualIdentityService.getPublicIdentities().map((identity) => ({
    userContextId: identity.userContextId,
    name: ContextualIdentityService.getUserContextLabel(identity.userContextId),
    icon: identity.icon,
    color: identity.color,
  }));
}

// A default pointing at a deleted container falls back to no container.
function readDefaultContainerId(): number {
  const userContextId = Services.prefs.getIntPref(DEFAULT_CONTAINER_PREF, NO_CONTAINER);
  if (!ContextualIdentityService.getPublicIdentityFromId(userContextId)) {
    return NO_CONTAINER;
  }
  return userContextId;
}

const [containers, setContainers] = createSignal<Container[]>(readContainers());
const [defaultContainerId, setDefaultContainerIdSignal] = createSignal(
  readDefaultContainerId(),
);

export { containers, defaultContainerId };

export function containerById(userContextId: number): Container | undefined {
  return containers().find((container) => container.userContextId === userContextId);
}

export function setDefaultContainerId(userContextId: number): void {
  Services.prefs.setIntPref(DEFAULT_CONTAINER_PREF, userContextId);
  setDefaultContainerIdSignal(userContextId);
}

export function createContainer(name: string): void {
  const color = CONTAINER_COLORS[containers().length % CONTAINER_COLORS.length];
  ContextualIdentityService.create(name, NEW_CONTAINER_ICON, color);
}

export function updateContainer(container: Container): void {
  ContextualIdentityService.update(
    container.userContextId,
    container.name,
    container.icon,
    container.color,
  );
}

// Deleting a container wipes its cookies and storage, so ask first.
export async function deleteContainer(container: Container): Promise<void> {
  const confirmed = Services.prompt.confirm(
    window as unknown as mozIDOMWindowProxy,
    "Delete container",
    `Delete "${container.name}"? Its tabs are closed and its cookies and site data are removed.`,
  );
  if (!confirmed) {
    return;
  }
  await ContextualIdentityService.closeContainerTabs(container.userContextId);
  ContextualIdentityService.remove(container.userContextId);
}

// A new observer per call: hot reload can run init again before the old
// instance is cleaned up, and debug builds abort when the same observer is
// added twice.
export function watchContainers(): () => void {
  const identityObserver = {
    observe(): void {
      setContainers(readContainers());
      setDefaultContainerIdSignal(readDefaultContainerId());
    },
  };
  for (const topic of IDENTITY_TOPICS) {
    Services.obs.addObserver(identityObserver, topic);
  }
  return () => {
    for (const topic of IDENTITY_TOPICS) {
      Services.obs.removeObserver(identityObserver, topic);
    }
  };
}
