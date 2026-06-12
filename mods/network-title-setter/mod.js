// name: network-title-setter
// author: MingTechpro
// date: 2026-03-12
// description: Detect network env, set page title dynamically—support intranet/public identification & custom config.

(function () {
  // Network configuration. Customize these values as needed.
  const NETWORK_CONFIG = {
    internal: {
      networkName: "", // Internal network name. Defaults to "Local Network".
      systemName: "", // Internal system name. Defaults to "HomeOS".
    },
    external: {
      networkName: "", // External network name. Defaults to "Public Network".
      systemName: "", // External system name. Defaults to the current document title.
    },
  };

  /**
   * Detect whether a hostname is on an internal network.
   * @param {string} hostname - Hostname or IP address.
   * @returns {boolean} True for an internal address, otherwise false.
   */
  function isInternalNetwork(hostname) {
    // 1. Detect localhost.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    // 2. Detect private IPv4 ranges.
    // 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x
    if (
      /^(?:(?:10|127|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168))\..*/.test(hostname)
    ) {
      return true;
    }

    // 3. Detect private IPv6 addresses.
    if (hostname.includes(":")) {
      const ipv6 = hostname.toLowerCase();
      if (
        ipv6 === "::1" ||
        ipv6.startsWith("fc") ||
        ipv6.startsWith("fd") ||
        ipv6.startsWith("fe80:")
      ) {
        return true;
      }
    }

    return false;
  }

  // Defaults used when a NETWORK_CONFIG value is empty.
  const DEFAULT_CONFIG = {
    internal: {
      networkName: "Local Network",
      systemName: "HomeOS",
    },
    external: {
      networkName: "Public Network",
      // The external system name defaults to the current document title.
      systemName: document.title,
    },
  };

  /**
   * Return a configured value or its default.
   * @param {string} networkType - Network type: "internal" or "external".
   * @param {string} field - Field name: "networkName" or "systemName".
   * @returns {string} Configuration value.
   */
  function getConfigValue(networkType, field) {
    const userValue = NETWORK_CONFIG[networkType][field];
    const defaultValue = DEFAULT_CONFIG[networkType][field];

    // Use the default when the user configuration is empty.
    return userValue === "" ? defaultValue : userValue;
  }

  // Get the current page host information.
  const hostname = window.location.hostname;
  const host = window.location.host;
  const isInternal = isInternalNetwork(hostname);

  /**
   * Format the page title.
   * @returns {string} Formatted title.
   */
  function formatTitle() {
    if (isInternal) {
      // Internal format: network name - system name | hostname:port
      const networkName = getConfigValue("internal", "networkName");
      const systemName = getConfigValue("internal", "systemName");
      return `${networkName} - ${systemName} | ${host}`;
    } else {
      // External format: network name - system name | hostname:port
      const networkName = getConfigValue("external", "networkName");
      const systemName = getConfigValue("external", "systemName");
      return `${networkName} - ${systemName} | ${host}`;
    }
  }

  // Set the page title.
  document.title = formatTitle();
})();
