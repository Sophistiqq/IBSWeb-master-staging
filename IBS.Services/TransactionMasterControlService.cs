using IBS.DataAccess.Data;
using IBS.DataAccess.Repository.IRepository;
using IBS.Models;
using IBS.Models.Enums;
using IBS.Models.Filpride.AccountsPayable;
using IBS.Models.Filpride.AccountsReceivable;
using IBS.Models.Filpride.Books;
using IBS.Models.Filpride.ViewModels;
using IBS.Utility.Helpers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace IBS.Services
{
    public interface ITransactionMasterControlService
    {
        Task<(string Type, string ReferenceNo)?> FindTransactionAsync(string referenceNo, string? company, CancellationToken cancellationToken);
        Task<TransactionMasterControlViewModel?> GetTransactionDetailsAsync(string referenceNo, string type, string? company, CancellationToken cancellationToken);
        Task UpdateTransactionAsync(TransactionMasterControlViewModel model, string? company, string userFullName, CancellationToken cancellationToken);
    }

    public class TransactionMasterControlService(
        ApplicationDbContext dbContext,
        IUnitOfWork unitOfWork,
        ILogger<TransactionMasterControlService> logger)
        : ITransactionMasterControlService
    {
        private const string PaymentForSeparator = ". Payment for ";

        public async Task<(string Type, string ReferenceNo)?> FindTransactionAsync(string referenceNo, string? company, CancellationToken cancellationToken)
        {
            referenceNo = referenceNo.Trim();

            // Try to find in CV
            if (await dbContext.FilprideCheckVoucherHeaders.AnyAsync(x => x.CheckVoucherHeaderNo == referenceNo && x.Company == company, cancellationToken))
                return ("CV", referenceNo);

            // Try to find in JV
            if (await dbContext.FilprideJournalVoucherHeaders.AnyAsync(x => x.JournalVoucherHeaderNo == referenceNo && x.Company == company, cancellationToken))
                return ("JV", referenceNo);

            // Try to find in SI
            if (await dbContext.FilprideSalesInvoices.AnyAsync(x => x.SalesInvoiceNo == referenceNo && x.Company == company, cancellationToken))
                return ("SI", referenceNo);

            // Try to find in SV
            if (await dbContext.FilprideServiceInvoices.AnyAsync(x => x.ServiceInvoiceNo == referenceNo && x.Company == company, cancellationToken))
                return ("SV", referenceNo);

            // Try to find in CR
            if (await dbContext.FilprideCollectionReceipts.AnyAsync(x => x.CollectionReceiptNo == referenceNo && x.Company == company, cancellationToken))
                return ("CR", referenceNo);

            return null;
        }

        public async Task<TransactionMasterControlViewModel?> GetTransactionDetailsAsync(string referenceNo, string type, string? company, CancellationToken cancellationToken)
        {
            TransactionMasterControlViewModel model = new() { ReferenceNo = referenceNo, TransactionType = type };

            if (type == "CV")
            {
                var header = await dbContext.FilprideCheckVoucherHeaders
                    .FirstOrDefaultAsync(x => x.CheckVoucherHeaderNo == referenceNo && x.Company == company, cancellationToken);

                if (header == null) return null;

                model.Date = header.Date;
                var particulars = header.Particulars ?? string.Empty;
                var index = particulars.IndexOf(PaymentForSeparator, StringComparison.Ordinal);
                if (index >= 0)
                {
                    model.Particulars = particulars.Substring(0, index).Trim();
                    model.PaymentFor = particulars.Substring(index + PaymentForSeparator.Length).Trim();
                }
                else
                {
                    model.Particulars = particulars;
                }

                model.Payee = header.Payee;
                model.CheckNo = header.CheckNo;
                model.CheckDate = header.CheckDate;
                model.IsFound = true;
            }
            else if (type == "JV")
            {
                var header = await dbContext.FilprideJournalVoucherHeaders
                    .FirstOrDefaultAsync(x => x.JournalVoucherHeaderNo == referenceNo && x.Company == company, cancellationToken);

                if (header == null) return null;

                model.Date = header.Date;
                model.Particulars = header.Particulars ?? string.Empty;
                model.IsFound = true;
            }
            else if (type == "SI")
            {
                var header = await dbContext.FilprideSalesInvoices
                    .FirstOrDefaultAsync(x => x.SalesInvoiceNo == referenceNo && x.Company == company, cancellationToken);

                if (header == null) return null;

                model.Date = header.TransactionDate;
                model.Particulars = header.Remarks ?? string.Empty;
                model.IsFound = true;
            }
            else if (type == "SV")
            {
                var header = await dbContext.FilprideServiceInvoices
                    .FirstOrDefaultAsync(x => x.ServiceInvoiceNo == referenceNo && x.Company == company, cancellationToken);

                if (header == null) return null;

                model.Date = header.Period;
                model.Particulars = header.Instructions ?? string.Empty;
                model.IsFound = true;
            }
            else if (type == "CR")
            {
                var header = await dbContext.FilprideCollectionReceipts
                    .FirstOrDefaultAsync(x => x.CollectionReceiptNo == referenceNo && x.Company == company, cancellationToken);

                if (header == null) return null;

                model.Date = header.TransactionDate;
                model.Particulars = header.Remarks ?? string.Empty;
                model.IsFound = true;
            }
            else
            {
                return null;
            }

            return model;
        }

        public async Task UpdateTransactionAsync(TransactionMasterControlViewModel model, string? company, string userFullName, CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(company))
            {
                throw new InvalidOperationException("Company claim is missing for the current user.");
            }

            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

            try
            {
                if (model.TransactionType == "CV")
                {
                    var header = await dbContext.FilprideCheckVoucherHeaders
                        .FirstOrDefaultAsync(x => x.CheckVoucherHeaderNo == model.ReferenceNo && x.Company == company, cancellationToken);

                    if (header == null) throw new Exception("CV Header not found.");

                    var finalParticulars = !string.IsNullOrWhiteSpace(model.PaymentFor)
                        ? $"{model.Particulars}{PaymentForSeparator}{model.PaymentFor}"
                        : model.Particulars;

                    // Update Header
                    header.Particulars = finalParticulars;
                    header.Payee = model.Payee;
                    header.CheckNo = model.CheckNo;
                    header.CheckDate = model.CheckDate;
                    header.EditedBy = userFullName;
                    header.EditedDate = DateTimeHelper.GetCurrentPhilippineTime();

                    // Update Disbursement Books
                    var disbursementBooks = await dbContext.FilprideDisbursementBooks
                        .Where(x => x.CVNo == model.ReferenceNo && x.Company == company)
                        .ToListAsync(cancellationToken);

                    foreach (var book in disbursementBooks)
                    {
                        book.Particulars = finalParticulars;
                        book.Payee = model.Payee ?? book.Payee;
                        book.CheckNo = model.CheckNo ?? book.CheckNo;
                        book.CheckDate = model.CheckDate?.ToString("MM/dd/yyyy") ?? book.CheckDate;
                    }

                    // Update GL Books
                    var glBooks = await dbContext.FilprideGeneralLedgerBooks
                        .Where(x => x.Reference == model.ReferenceNo && x.Company == company)
                        .ToListAsync(cancellationToken);

                    foreach (var gl in glBooks)
                    {
                        gl.Description = finalParticulars;
                    }

                    // Cascading update
                    if (header.CvType == nameof(CVType.Invoicing))
                    {
                        var paymentCvIds = await dbContext.FilprideMultipleCheckVoucherPayments
                            .Where(x => x.CheckVoucherHeaderInvoiceId == header.CheckVoucherHeaderId)
                            .Select(x => x.CheckVoucherHeaderPaymentId)
                            .ToListAsync(cancellationToken);

                        foreach (var paymentId in paymentCvIds)
                        {
                            var paymentHeader = await dbContext.FilprideCheckVoucherHeaders
                                .FirstOrDefaultAsync(x => x.CheckVoucherHeaderId == paymentId, cancellationToken);

                            if (paymentHeader != null)
                            {
                                var oldPaymentParticulars = paymentHeader.Particulars ?? "";
                                var paymentIndex = oldPaymentParticulars.IndexOf(PaymentForSeparator, StringComparison.Ordinal);

                                if (paymentIndex >= 0)
                                {
                                    var suffix = oldPaymentParticulars.Substring(paymentIndex);
                                    var newPaymentParticulars = model.Particulars + suffix;

                                    if (paymentHeader.Particulars != newPaymentParticulars)
                                    {
                                        paymentHeader.Particulars = newPaymentParticulars;
                                        paymentHeader.EditedBy = userFullName;
                                        paymentHeader.EditedDate = DateTimeHelper.GetCurrentPhilippineTime();

                                        var pBooks = await dbContext.FilprideDisbursementBooks
                                            .Where(x => x.CVNo == paymentHeader.CheckVoucherHeaderNo && x.Company == company)
                                            .ToListAsync(cancellationToken);
                                        foreach (var b in pBooks) b.Particulars = newPaymentParticulars;

                                        var pGls = await dbContext.FilprideGeneralLedgerBooks
                                            .Where(x => x.Reference == paymentHeader.CheckVoucherHeaderNo && x.Company == company)
                                            .ToListAsync(cancellationToken);
                                        foreach (var gl in pGls) gl.Description = newPaymentParticulars;
                                    }
                                }
                            }
                        }
                    }
                }
                else if (model.TransactionType == "JV")
                {
                    var header = await dbContext.FilprideJournalVoucherHeaders
                        .FirstOrDefaultAsync(x => x.JournalVoucherHeaderNo == model.ReferenceNo && x.Company == company, cancellationToken);
                    if (header == null) throw new Exception("JV Header not found.");

                    header.Particulars = model.Particulars;
                    await UpdateCommonBooksAsync(header, model.ReferenceNo, model.Particulars, company, userFullName, cancellationToken);
                }
                else if (model.TransactionType == "SI")
                {
                    var header = await dbContext.FilprideSalesInvoices
                        .FirstOrDefaultAsync(x => x.SalesInvoiceNo == model.ReferenceNo && x.Company == company, cancellationToken);
                    if (header == null) throw new Exception("SI Header not found.");

                    header.Remarks = model.Particulars;
                    await UpdateCommonBooksAsync(header, model.ReferenceNo, model.Particulars, company, userFullName, cancellationToken);
                }
                else if (model.TransactionType == "SV")
                {
                    var header = await dbContext.FilprideServiceInvoices
                        .FirstOrDefaultAsync(x => x.ServiceInvoiceNo == model.ReferenceNo && x.Company == company, cancellationToken);
                    if (header == null) throw new Exception("SV Header not found.");

                    header.Instructions = model.Particulars;
                    await UpdateCommonBooksAsync(header, model.ReferenceNo, model.Particulars, company, userFullName, cancellationToken);
                }
                else if (model.TransactionType == "CR")
                {
                    var header = await dbContext.FilprideCollectionReceipts
                        .FirstOrDefaultAsync(x => x.CollectionReceiptNo == model.ReferenceNo && x.Company == company, cancellationToken);
                    if (header == null) throw new Exception("CR Header not found.");

                    header.Remarks = model.Particulars;
                    await UpdateCommonBooksAsync(header, model.ReferenceNo, model.Particulars, company, userFullName, cancellationToken);
                }

                await dbContext.SaveChangesAsync(cancellationToken);

                FilprideAuditTrail auditTrail = new(
                    userFullName,
                    $"Updated particulars/metadata for {model.TransactionType}# {model.ReferenceNo} via Master Control",
                    "Master Control",
                    company
                );
                await unitOfWork.FilprideAuditTrail.AddAsync(auditTrail, cancellationToken);
                await unitOfWork.SaveAsync(cancellationToken);

                await transaction.CommitAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(cancellationToken);
                var safeRefNo = model.ReferenceNo?.Replace("\r", string.Empty).Replace("\n", string.Empty);
                logger.LogError(ex, "Error updating transaction via Master Control. Ref: {Ref}", safeRefNo);
                throw;
            }
        }

        private async Task UpdateCommonBooksAsync(object header, string referenceNo, string particulars, string company, string userFullName, CancellationToken cancellationToken)
        {
            if (header is BaseEntity baseEntity)
            {
                baseEntity.EditedBy = userFullName;
                baseEntity.EditedDate = DateTimeHelper.GetCurrentPhilippineTime();
            }

            // Update Journal Books (for JV)
            if (header is FilprideJournalVoucherHeader)
            {
                var journalBooks = await dbContext.FilprideJournalBooks
                    .Where(x => x.Reference == referenceNo && x.Company == company)
                    .ToListAsync(cancellationToken);
                foreach (var book in journalBooks) book.Description = particulars;
            }

            // Update Sales Books (for SI, SV)
            if (header is FilprideSalesInvoice || header is FilprideServiceInvoice)
            {
                var salesBooks = await dbContext.FilprideSalesBooks
                    .Where(x => x.SerialNo == referenceNo && x.Company == company)
                    .ToListAsync(cancellationToken);
                foreach (var book in salesBooks) book.Description = particulars;
            }

            // Update Cash Receipt Books (for CR)
            if (header is FilprideCollectionReceipt)
            {
                var cashReceiptBooks = await dbContext.FilprideCashReceiptBooks
                    .Where(x => x.RefNo == referenceNo && x.Company == company)
                    .ToListAsync(cancellationToken);
                foreach (var book in cashReceiptBooks) book.Particulars = particulars;
            }

            // Update GL Books (Common)
            var glBooks = await dbContext.FilprideGeneralLedgerBooks
                .Where(x => x.Reference == referenceNo && x.Company == company)
                .ToListAsync(cancellationToken);
            foreach (var gl in glBooks) gl.Description = particulars;
        }
    }
}
