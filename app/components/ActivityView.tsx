import { useVault } from "@/context/VaultContext";
import { useView } from "@/context/ViewContext";
import { Transaction } from "@/lib/api/types/VaultData.types";
import { useDeposit } from "@/lib/contracts/hooks/useDeposit";
import { getTypedChainId } from "@/lib/utils/chain";
import { getEnvVars } from "@/lib/utils/env";
import { useAppKitNetwork } from "@reown/appkit/react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CheckIcon from "./icons/CheckIcon";
import CloseIcon from "./icons/CloseIcon";
import DoubleCheckIcon from "./icons/DoubleCheckIcon";
import WaitingSettlementIcon from "./icons/WaitingSettlementIcon";
import Card from "./ui/common/Card";
import LoadingComponent from "./ui/common/LoadingComponent";
import Select from "./ui/common/Select";
import Toast, { ToastType } from "./ui/common/Toast";

export default function ActivityView() {
  const { address } = useParams();
  const { chainId } = useAppKitNetwork();
  const { vault, isLoading } = useVault();
  const queryClient = useQueryClient();
  const { cancelDepositRequest } = useDeposit();
  const { isChangingView, setViewLoaded } = useView();
  const [filter, setFilter] = useState("all");
  const transactions = useMemo(
    () => vault?.activityData ?? [],
    [vault?.activityData]
  );
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");

  const handleCancelDeposit = async () => {
    const tx = await cancelDepositRequest();
    setToastMessage("Cancel deposit request submitted!");
    setToastType("info");
    setShowToast(true);

    await tx.wait();
    setToastMessage("Deposit request successfully canceled!");
    setToastType("success");
    setShowToast(true);

    // Invalidate and refetch vault data
    queryClient.invalidateQueries({ queryKey: ["vaultData", address] });
  };

  useEffect(() => {
    if (!isLoading && transactions) {
      setViewLoaded();
    }
  }, [isLoading, transactions, setViewLoaded]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "waiting_settlement":
        return <WaitingSettlementIcon />;
      case "settled":
        return <CheckIcon />;
      case "completed":
        return <DoubleCheckIcon />;
      case "failed":
        return <CloseIcon className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getActionButton = (tx: Transaction) => {
    if (tx.type === "deposit" && tx.status === "waiting_settlement") {
      return (
        <button
          onClick={() => handleCancelDeposit()}
          className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors border-2 border-red-500/80 hover:border-red-500"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      );
    }
    return null;
  };

  const getTransactionType = (type: string) => {
    switch (type) {
      case "deposit":
        return "Deposit";
      case "withdraw":
        return "Withdraw";
      case "claim":
        return "Claim";
      case "redeem":
        return "Redeem";
      case "claim_and_redeem":
        return "Claim & Redeem";
      case "sent":
        return "Sent";
      case "received":
        return "Received";
      default:
        return type;
    }
  };

  const getTxsTable = () => {
    return (
      <div className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto pr-2">
        {transactions
          .filter((tx) => {
            if (filter === "all") return true;
            if (filter === "cancellable") {
              return (
                tx.type === "deposit" && tx.status === "waiting_settlement"
              );
            }
            if (filter === "deposit") return tx.type === "deposit";
            if (filter === "withdraw") return tx.type === "withdraw";
            if (filter === "claim") return tx.type === "claim";
            if (filter === "redeem") return tx.type === "redeem";
            if (filter === "claim_and_redeem")
              return tx.type === "claim_and_redeem";
            if (filter === "transfers")
              return tx.type === "sent" || tx.type === "received";
            return true;
          })
          .map((tx, index) => {
            const explorerLink = `${
              getEnvVars(getTypedChainId(chainId as number))
                .BLOCK_EXPLORER_GATEWAY
            }/tx/${tx.txHash}`;

            return (
              <div
                key={index}
                className="flex items-center space-x-3 py-2 border-b border-border-light dark:border-border last:border-0"
              >
                <div className="w-8 flex items-center justify-center">
                  {getActionButton(tx)}
                </div>
                <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                  <div className="flex items-center space-x-2">
                    <p className="font-medium text-xs">
                      {getTransactionType(tx.type)} #{tx.id}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <p className="text-xs text-muted-light dark:text-muted">
                      {tx.amount}
                    </p>
                  </div>
                  <div className="col-span-2 flex items-center justify-center">
                    <a
                      href={explorerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-lime-400 hover:underline drop-shadow-[0_0_1px_rgba(163,230,53,0.3)]"
                    >
                      {tx.txHashShort}
                    </a>
                  </div>
                  <div className="flex items-center justify-end space-x-4">
                    <p className="text-xs text-muted-light dark:text-muted">
                      {tx.timestamp}
                    </p>
                    <div className="w-4 h-4 flex items-center justify-center">
                      {getStatusIcon(tx.status)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    );
  };

  if (isLoading || isChangingView || !vault || !vault.activityData) {
    return <LoadingComponent text="Loading activity data..." />;
  }

  return (
    transactions && (
      <>
        <Card
          title="Recent Activity"
          variant="small"
          subtitle="Transaction activity for this liquidity vault"
          selector={
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              options={[
                "all",
                "cancellable",
                "deposit",
                "withdraw",
                "claim",
                "redeem",
                "claim_and_redeem",
                "transfers",
              ]}
              displayLabels={{
                all: "All Activities",
                cancellable: "Cancellable",
                deposit: "Deposits",
                withdraw: "Withdraws",
                claim: "Claims",
                redeem: "Redeems",
                claim_and_redeem: "Claim & Redeem",
                transfers: "Transfers",
              }}
              size="small"
            />
          }
        >
          {getTxsTable()}
        </Card>

        {/* Toast */}
        <Toast
          show={showToast}
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
          duration={5000}
        />
      </>
    )
  );
}
