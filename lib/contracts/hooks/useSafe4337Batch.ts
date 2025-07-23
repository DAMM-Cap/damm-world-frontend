import { supportedChainsActiveObject } from "@/lib/reown";
import { useAppKitNetwork } from "@reown/appkit/react";
import type { Eip1193Provider } from "@safe-global/protocol-kit";
import { Safe4337Pack } from "@safe-global/relay-kit";
import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom } from "viem";
import { parseAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { Safe4337Tx } from "./useDeposit";

// Gets a Safe-compatible viem signer for 4337
export async function getSafe4337Signer(address: string, chainId: string) {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet provider found");
  }

  return createWalletClient({
    account: parseAccount(address),
    chain:
      supportedChainsActiveObject[
        chainId as keyof typeof supportedChainsActiveObject
      ],

    transport: custom(window.ethereum as Eip1193Provider),
  });
}

export async function getSafe4337Pack(address: string, chainId: string) {
  const signer = await getSafe4337Signer(address, chainId);
  const provider = window.ethereum as unknown as Eip1193Provider;
  console.log("signer", signer.account?.address);
  const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;

  const pack = await Safe4337Pack.init({
    provider: provider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: signer as any,
    bundlerUrl: `https://api.pimlico.io/v2/${chainId}/rpc?add_balance_override&apikey=${PIMLICO_API_KEY}`,
    customContracts: {
      entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // Entrypoint v0.6
    },
    safeModulesVersion: "0.2.0", // default Safe4337Pack version, only compatible with Entrypoint v0.6
    options: {
      owners: [address],
      threshold: 1,
    },
    paymasterOptions: {
      paymasterUrl: `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`,
      paymasterAddress: "0x0000000000000000000000000000000000000000",
      paymasterTokenAddress: "0x0000000000000000000000000000000000000000",
      amountToApprove: BigInt(0),
    },
  });

  console.log("pack", pack.getChainId());
  return pack;
}

export type SafeBatchResult =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "simulating" }
  | { status: "simulation-success"; estimate: string }
  | { status: "success"; userOpHash: string; safeAddress: string }
  | { status: "error"; error: Error };

export function useSafe4337BatchTx() {
  const { address } = useAccount();
  const network = useAppKitNetwork();

  const chainId = network.chainId?.toString() ?? "";

  const [result, setResult] = useState<SafeBatchResult>({ status: "idle" });
  const [safeAddress, setSafeAddress] = useState<string | null>(null);

  const storageKey = "userSafeAddress";

  // Load Safe address from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setSafeAddress(saved);
  }, []);

  const sendBatchTx = useCallback(
    async (txs: Safe4337Tx[]) => {
      try {
        setResult({ status: "pending" });

        if (!address) throw new Error("No address found");
        if (!window.ethereum)
          throw new Error(
            "No EIP-1193 provider found (is MetaMask installed?)"
          );

        const safe4337Pack = await getSafe4337Pack(address, chainId);

        const safeOp = await safe4337Pack.createTransaction({
          transactions: txs,
        });
        const signed = await safe4337Pack.signSafeOperation(safeOp);

        const userOpHash = await safe4337Pack.executeTransaction({
          executable: signed,
        });

        const finalSafeAddress =
          safe4337Pack.protocolKit.getPredictedSafe()?.safeAccountConfig.to;

        if (finalSafeAddress) {
          localStorage.setItem(storageKey, finalSafeAddress);
          setSafeAddress(finalSafeAddress);
        }

        let userOperationReceipt = null;

        while (!userOperationReceipt) {
          // Wait 2 seconds before checking the status again
          await new Promise((resolve) => setTimeout(resolve, 2000));
          userOperationReceipt = await safe4337Pack.getUserOperationReceipt(
            userOpHash
          );
        }

        setResult({
          status: "success",
          userOpHash,
          safeAddress: finalSafeAddress ?? "",
        });
      } catch (error) {
        console.error("Safe batch error", error);
        setResult({ status: "error", error: error as Error });
      }
    },
    [address, chainId]
  );

  return { sendBatchTx, result, safeAddress };
}
