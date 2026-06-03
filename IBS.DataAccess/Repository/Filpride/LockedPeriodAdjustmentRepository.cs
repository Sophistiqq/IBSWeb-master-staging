using IBS.DataAccess.Data;
using IBS.DataAccess.Repository.Filpride.IRepository;
using IBS.Models.Enums;
using IBS.Models.Filpride;
using IBS.Utility.Helpers;
using Microsoft.EntityFrameworkCore;

namespace IBS.DataAccess.Repository.Filpride
{
    public class LockedPeriodAdjustmentRepository : Repository<LockedPeriodAdjustment>, ILockedPeriodAdjustmentRepository
    {
        private readonly ApplicationDbContext _db;

        public LockedPeriodAdjustmentRepository(ApplicationDbContext db) : base(db)
        {
            _db = db;
        }

        public async Task AddIfPeriodPostedAsync(
            Module module,
            DateOnly transactionDate,
            LockedPeriodAdjustmentType adjustmentType,
            string entityNo,
            decimal oldValue,
            decimal newValue,
            decimal adjustmentValue,
            string reason,
            string createdBy,
            CancellationToken cancellationToken = default)
        {
            if (adjustmentValue == 0m)
            {
                return;
            }

            var isPeriodPosted = await _db.PostedPeriods
                .AnyAsync(m =>
                    m.Module == module.ToString() &&
                    m.IsPosted &&
                    m.Year == transactionDate.Year &&
                    m.Month == transactionDate.Month,
                    cancellationToken);

            if (!isPeriodPosted)
            {
                return;
            }

            await dbSet.AddAsync(new LockedPeriodAdjustment
            {
                Period = new DateOnly(transactionDate.Year, transactionDate.Month, 1),
                AdjustmentType = adjustmentType,
                EntityTypeNo = entityNo,
                Module = module,
                OldValue = oldValue,
                NewValue = newValue,
                AdjustmentValue = adjustmentValue,
                Reason = reason,
                CreatedBy = createdBy,
                CreatedDate = DateTimeHelper.GetCurrentPhilippineTime()
            }, cancellationToken);
        }
    }
}
