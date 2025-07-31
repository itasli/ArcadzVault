import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

const ArcadzVaultModule = buildModule("ArcadzVaultModule", (m) => {
  const signer = m.getParameter("signer", process.env.SIGNER_ADDRESS);

  const bonezToken = m.contract("MockERC20", ["Bonez Token", "BONEZ", parseEther("1000000")]);

  const vault = m.contract("ArcadzVault", [bonezToken, signer]);

  return { bonezToken, vault };
});

export default ArcadzVaultModule;