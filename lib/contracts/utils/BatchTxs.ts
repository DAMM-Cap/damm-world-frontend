import { ethers } from "ethers";
import { getSignerAndContract } from "./utils";

const MULTICALL3_ABI = [
  "function aggregate(tuple(address target, bytes callData)[] calls) external view returns (uint256 blockNumber, bytes[] returnData)",
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

export interface Call {
  target: string;
  allowFailure: boolean;
  callData: string;
  params?: any[];
}

export async function batchTxs(chainId: string, calls: Call[], value?: string) {
  const { signer } = await getSignerAndContract(chainId);
  const multicall = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    signer
  );

  try {
    // Step 1: Simulate off-chain to detect failures
    const simulation = await multicall.callStatic.aggregate3(calls, {
      value: value || 0,
    });
    const failed = simulation.find(
      (result: { success: boolean }) => result.success === false
    );

    if (failed) {
      console.warn("Simulation failed:", simulation);
      throw new Error("Multicall simulation failed");
    }

    // Step 2: Estimate gas from populated transaction
    const txRequest = await multicall.populateTransaction.aggregate3(calls, {
      value: value || 0,
    });
    const gasEstimate = await signer.estimateGas(txRequest);

    // Step 3: Send with buffer
    const tx = await signer.sendTransaction({
      ...txRequest,
      gasLimit: gasEstimate.mul(12).div(10), // 20% buffer
    });

    console.log(`Batch tx sent: ${tx.hash}`);
    return tx;
  } catch (error) {
    console.error("Multicall batch failed:", error);
    throw error;
  }
}
