import { defineConfig } from '@wagmi/cli'
import { hardhat } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/generated.ts',
  contracts: [],
  plugins: [
    hardhat({
      project: '.',
      artifacts: 'artifacts',
      include: [
        'ArcadzVault.sol/ArcadzVault.json',
      ],
      exclude: [
        // Exclude test contracts and libraries
        '**/*.t.sol/**',
        '**/*Test.sol/**',
        '**/test/**',
        '**/Mock*.sol/**',
        // Also exclude common OpenZeppelin imports
        '**/node_modules/**',
        '**/@openzeppelin/**',
      ],
    }),
  ],
})