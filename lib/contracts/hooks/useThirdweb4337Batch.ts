"use client";

import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Chain,
  createThirdwebClient,
  defineChain,
  getContract,
  prepareContractCall,
  sendTransaction,
  simulateTransaction,
  ThirdwebClient,
  waitForReceipt,
} from "thirdweb";
import {
  Account,
  createWallet,
  inAppWallet,
  smartWallet,
} from "thirdweb/wallets";
import { AA4337Tx } from "./useDeposit";

type ThirdwebTx = {
  address: string;
  contract: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  method: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any[];
};

export function useThirdweb4337BatchTx() {
  const network = useAppKitNetwork();
  const account = useAppKitAccount();
  const address = account?.address;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [client, setClient] = useState<ThirdwebClient | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);
  const accountRef = useRef<Account | null>(null);
  const [factoryAddress, setFactoryAddress] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      const client = createThirdwebClient({
        clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID as string,
      });

      const chain = defineChain(Number(network.chainId));
      const factoryAddress = process.env
        .NEXT_PUBLIC_THIRDWEB_FACTORY_ADDRESS as string;
      setClient(client);
      setChain(chain);
      setFactoryAddress(factoryAddress);
    };

    if (address) {
      console.log("Address: ", address);
      initialize();
    }
  }, [address, network.chainId]);

  const sendBatchTx = useCallback(
    async (txs: AA4337Tx[]) => {
      try {
        setIsLoading(true);
        setError(null);
        //const account = accountRef.current;

        if (!address) throw new Error("No address found");
        if (!client || !chain /* || !account */)
          throw new Error("No client found");

        //const personalWallet = inAppWallet();
        const personalWallet = inAppWallet({
          // enable gasless transactions for the wallet
          executionMode: {
            mode: "EIP7702",
            sponsorGas: false,
          },
        });
        const personalAccount = await personalWallet.connect({
          client,
          strategy: "wallet",
          wallet: createWallet("io.metamask"),
          chain,
        });

        console.log("Personal account: ", personalAccount.address);

        // Create and connect smart wallet
        const wallet = smartWallet({
          chain,
          factoryAddress: factoryAddress!,
          gasless: false,
        });

        const account = await wallet.connect({
          client,
          personalAccount,
        });

        console.log("Smart account: ", account);

        const methods = [
          "function deposit()",
          "function setOperator(address operator, bool approved)",
          "function approve(address guy, uint wad)",
          "function requestDeposit(uint256 assets,address controller,address owner,address referral)",
        ];

        console.log("Tx: ", txs);
        console.log("Methods: ", methods);

        for (let i = 0; i < txs.length; i++) {
          console.log("Sending transaction...");

          const receipt = await sendTransactionHelper(
            {
              address: txs[i].to,
              contract: txs[i].to,
              method: methods[i],
              params: txs[i].params,
            },
            account
          );
          console.log("Receipt: ", receipt);
        }
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [address, client, chain]
  );

  const sendTransactionHelper = async (tx: ThirdwebTx, account: Account) => {
    try {
      if (!address) throw new Error("No address found");
      if (!client || !chain /* || !account */)
        throw new Error("No client found");

      const contract = getContract({
        client,
        chain,
        address: tx.address,
      });

      // prepare the contract write call
      const transaction = prepareContractCall({
        contract,
        method: tx.method,
        params: tx.params,
      });

      console.log("Transaction: ", transaction);

      console.log("Start Simulation...");

      const simulation = await simulateTransaction({
        account,
        transaction,
      });

      console.log("Simulation: ", simulation);

      const { transactionHash } = await sendTransaction({
        account,
        transaction,
      });

      console.log("Transaction hash: ", transactionHash);

      const receipt = await waitForReceipt({
        client,
        chain,
        transactionHash,
      });

      return receipt;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    }
  };

  const prepareAccountAbstraction = useCallback(async () => {
    try {
      if (!address) throw new Error("No address found");
      if (!client || !chain || !factoryAddress)
        throw new Error("No client found");

      // Connect personal wallet first
      const personalWallet = inAppWallet();
      const personalAccount = await personalWallet.connect({
        client,
        strategy: "wallet",
        wallet: createWallet("io.metamask"),
        chain,
      });

      console.log("Personal account: ", personalAccount.address);

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

      console.log("Smart account: ", account.address);

      accountRef.current = account;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      throw error;
    }
  }, [address, client, chain, factoryAddress]);

  return {
    sendBatchTx,
    prepareAccountAbstraction,
    isLoading,
    error,
    smartWalletAddress: accountRef.current?.address,
  };
}
