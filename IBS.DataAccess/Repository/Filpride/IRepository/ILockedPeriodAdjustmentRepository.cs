using IBS.DataAccess.Repository.IRepository;
using IBS.Models.Enums;
using IBS.Models.Filpride;

namespace IBS.DataAccess.Repository.Filpride.IRepository
{
    public interface ILockedPeriodAdjustmentRepository : IRepository<LockedPeriodAdjustment>
    {
        Task AddIfPeriodPostedAsync(
            Module module,
            DateOnly transactionDate,
            LockedPeriodAdjustmentType adjustmentType,
            string entityNo,
            decimal oldValue,
            decimal newValue,
            decimal adjustmentValue,
            string reason,
            string createdBy,
            CancellationToken cancellationToken = default);
    }
}
