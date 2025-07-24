"use client";

import { useAppKitNetwork } from "@reown/appkit/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Chain,
  createThirdwebClient,
  defineChain,
  getContract,
  getContractEvents,
  prepareContractCall,
  prepareEvent,
  sendTransaction,
  simulateTransaction,
  ThirdwebClient,
  waitForReceipt,
} from "thirdweb";
import { Account, inAppWallet, smartWallet } from "thirdweb/wallets";
import { useAccount } from "wagmi";
import { AA4337Tx } from "./useDeposit";

export function useThirdweb4337BatchTx() {
  const { address } = useAccount();
  const network = useAppKitNetwork();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [client, setClient] = useState<ThirdwebClient | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const smartWalletAddress = useRef<string | null>(null);
  const [factoryAddress, setFactoryAddress] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      const client = createThirdwebClient({
        clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID as string,
      });

      const chain = defineChain(Number(network.chainId));

      // Connect personal wallet first
      const personalWallet = inAppWallet();
      const personalAccount = await personalWallet.connect({
        client,
        chain,
        strategy: "guest",
      });

      const factoryAddress = process.env
        .NEXT_PUBLIC_THIRDWEB_FACTORY_ADDRESS as string;

      // Create and connect smart wallet
      const wallet = smartWallet({
        chain,
        factoryAddress,
        gasless: true,
      });

      const account = await wallet.connect({
        client,
        personalAccount,
      });

      setAccount(account);
      setClient(client);
      setChain(chain);
      setFactoryAddress(factoryAddress);
    };
    if (!address) throw new Error("No address found");
    initialize();
  }, [address, network.chainId]);

  const sendBatchTx = useCallback(
    async (txs: AA4337Tx[]) => {
      try {
        setIsLoading(true);
        setError(null);

        if (!address) throw new Error("No address found");
        if (!client || !chain || !account || !smartWalletAddress.current)
          throw new Error("No client found");

        const contract = getContract({
          client,
          chain,
          address: smartWalletAddress.current,
        });

        // Execute batch transaction using multicall
        const batchTx = {
          chainId: Number(network.chainId),
          calls: txs.map((tx) => ({
            target: tx.to as `0x${string}`,
            callData: tx.data as `0x${string}`,
            value: BigInt(tx.value),
          })),
        };

        const data = batchTx.calls.map((call) => call.callData);
        console.log("data", data);

        console.log("Prepare");

        const transaction = prepareContractCall({
          contract,
          method: "function multicall(bytes[] data) returns (bytes[] results)",
          params: [data],
        });
        console.log("transaction", transaction);
        console.log("SIMULATE");

        const simulation = await simulateTransaction({
          account,
          transaction,
        });
        console.log("ACA");
        console.log("simulation", simulation);

        const { transactionHash } = await sendTransaction({
          account,
          transaction,
        });

        const receipt = await waitForReceipt({
          client,
          chain,
          transactionHash,
        });
        console.log("receipt", receipt);

        return receipt;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [address, client, chain, account, network.chainId]
  );

  const prepareAccountAbstraction = useCallback(async () => {
    try {
      if (!address) throw new Error("No address found");
      if (!client || !chain || !account || !factoryAddress)
        throw new Error("No client found");

      const contract = getContract({
        client,
        chain,
        address: factoryAddress,
      });

      const _data = "0x";

      const transaction = prepareContractCall({
        contract,
        method:
          "function createAccount(address _admin, bytes _data) returns (address)",
        params: [address, _data],
      });
      console.log("transaction", transaction);
      const { transactionHash } = await sendTransaction({
        transaction,
        account,
      });
      console.log("transactionHash", transactionHash);

      const preparedEvent = prepareEvent({
        signature:
          "event AccountCreated(address indexed account, address indexed accountAdmin)",
      });
      const events = await getContractEvents({
        contract,
        events: [preparedEvent],
      });
      console.log("events", events[1].args.account);
      const newAccountAddress = events[1].args.account;

      smartWalletAddress.current = newAccountAddress;

      return newAccountAddress;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    }
  }, [address, client, chain, account, factoryAddress]);

  return {
    sendBatchTx,
    prepareAccountAbstraction,
    isLoading,
    error,
  };
}
