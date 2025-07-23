import { supportedChainsActiveObject } from "@/lib/reown";
import { useAppKitNetwork } from "@reown/appkit/react";
import type { Eip1193Provider } from "@safe-global/protocol-kit";
import { Safe4337Pack } from "@safe-global/relay-kit";
import { getAddress } from "ethers/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
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

  if (!PIMLICO_API_KEY) {
    throw new Error(
      "NEXT_PUBLIC_PIMLICO_API_KEY environment variable is required"
    );
  }

  if (!address) {
    throw new Error("Address is required for Safe4337Pack initialization");
  }

  if (!chainId) {
    throw new Error("ChainId is required for Safe4337Pack initialization");
  }

  // Go back to Pimlico with paymaster to cover gas costs
  const bundlerUrl = PIMLICO_API_KEY
    ? `https://api.pimlico.io/v2/${chainId}/rpc?add_balance_override&apikey=${PIMLICO_API_KEY}`
    : undefined;

  const paymasterUrl = PIMLICO_API_KEY
    ? `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${PIMLICO_API_KEY}`
    : undefined;

  console.log("Debug - bundlerUrl:", bundlerUrl);
  console.log("Debug - paymasterUrl:", paymasterUrl);

  // Use the correct Safe4337Pack configuration with paymaster
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initOptions: any = {
    provider: provider,
    bundlerUrl: bundlerUrl,
    entryPointAddress: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", // Entrypoint v0.7
    safeModulesVersion: "0.3.0", // Try newer version for better EntryPoint v0.7 support
    options: {
      owners: [getAddress(address)],
      threshold: 1,
    },
  };

  // Add paymaster options to cover gas costs
  if (paymasterUrl) {
    initOptions.paymasterOptions = {
      paymasterUrl: paymasterUrl,
      //paymasterAddress: "0x67F21bE69A16c314a0b7Da537309b2f3ADdDE031",
      //paymasterTokenAddress: "0xFC3e86566895Fb007c6A0d3809eb2827DF94F751",
      paymasterAddress: "0x00000000000000fB866DaAA79352cC568a005D96", // Pimlico verifying paymaster (sponsorshiped up to quota)
    };
  }

  console.log("Debug - initOptions keys:", Object.keys(initOptions));
  console.log("Debug - bundlerUrl:", initOptions.bundlerUrl);
  console.log("Debug - entryPointAddress:", initOptions.entryPointAddress);
  console.log("Debug - owners:", initOptions.options.owners);
  console.log("Debug - threshold:", initOptions.options.threshold);
  if (initOptions.paymasterOptions) {
    console.log(
      "Debug - paymasterUrl:",
      initOptions.paymasterOptions.paymasterUrl
    );
    console.log(
      "Debug - paymasterAddress:",
      initOptions.paymasterOptions.paymasterAddress
    );
  }

  const pack = await Safe4337Pack.init(initOptions);

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
  const safe4337PackRef = useRef<Safe4337Pack | null>(null);

  const storageKey = "userSafeAddress";

  // Load Safe address from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setSafeAddress(saved);
  }, []);

  const sendBatchTx = useCallback(
    async (txs: Safe4337Tx[]) => {
      try {
        const safe4337Pack = safe4337PackRef.current;
        if (!safe4337Pack) return;

        const safeOp = await safe4337Pack.createTransaction({
          transactions: txs,
        });

        const signed = await safe4337Pack.signSafeOperation(safeOp);

        const userOpHash = await safe4337Pack.executeTransaction({
          executable: signed,
        });

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
          safeAddress: safeAddress ?? "",
        });
      } catch (error) {
        console.error("Safe batch error", error);
        setResult({ status: "error", error: error as Error });
        throw error; // Re-throw to be caught by the calling function
      }
    },
    [safeAddress]
  );

  const prepareAccountAbstraction = useCallback(async () => {
    try {
      setResult({ status: "pending" });

      if (!address) throw new Error("No address found");
      if (!window.ethereum)
        throw new Error("No EIP-1193 provider found (is MetaMask installed?)");

      const safe4337Pack = await getSafe4337Pack(address, chainId);

      const finalSafeAddress =
        safe4337Pack.protocolKit.getPredictedSafe()?.safeAccountConfig.to;
      console.log("finalSafeAddress", finalSafeAddress);
      if (finalSafeAddress) {
        localStorage.setItem(storageKey, finalSafeAddress);
        setSafeAddress(finalSafeAddress);
      }
      safe4337PackRef.current = safe4337Pack;
      return finalSafeAddress;
    } catch (error) {
      console.error("Safe batch error", error);
      setResult({ status: "error", error: error as Error });
      throw error; // Re-throw to be caught by the calling function
    }
  }, [chainId, address]);

  return { sendBatchTx, result, safeAddress, prepareAccountAbstraction };
}
