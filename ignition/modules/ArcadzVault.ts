import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ArcadzVaultModule = buildModule("ArcadzVaultModule", (m) => {
  const signer = m.getParameter("signer", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");

  const bonezToken = m.contract("MockERC20", ["Bonez Token", "BONEZ", 100000000]);

  const vault = m.contract("ArcadzVault", [bonezToken, signer]);

  return { bonezToken, vault };
});

export default ArcadzVaultModule;