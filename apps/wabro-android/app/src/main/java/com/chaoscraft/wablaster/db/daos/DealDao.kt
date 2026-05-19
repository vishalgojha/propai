package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.Deal
import kotlinx.coroutines.flow.Flow

@Dao
interface DealDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(deal: Deal): Long

    @Update
    suspend fun update(deal: Deal)

    @Delete
    suspend fun delete(deal: Deal)

    @Query("SELECT * FROM deals WHERE id = :id")
    suspend fun getById(id: Long): Deal?

    @Query("SELECT * FROM deals ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<Deal>>

    @Query("SELECT * FROM deals WHERE brokerId = :brokerId ORDER BY createdAt DESC")
    fun getByBroker(brokerId: Long): Flow<List<Deal>>

    @Query("SELECT * FROM deals WHERE campaignId = :campaignId ORDER BY createdAt DESC")
    fun getByCampaign(campaignId: Long): Flow<List<Deal>>

    @Query("SELECT * FROM deals WHERE listingId = :listingId ORDER BY createdAt DESC")
    fun getByListing(listingId: Long): Flow<List<Deal>>

    @Query("SELECT * FROM deals WHERE commissionStatus = :status ORDER BY createdAt DESC")
    fun getByCommissionStatus(status: String): Flow<List<Deal>>

    @Query("""
        SELECT deals.*, l.name as listingName, b.name as brokerName, b.phone as brokerPhone
        FROM deals
        LEFT JOIN listings l ON deals.listingId = l.id
        LEFT JOIN brokers b ON deals.brokerId = b.id
        WHERE deals.brokerId = :brokerId
        ORDER BY deals.createdAt DESC
    """)
    fun getDealsWithDetails(brokerId: Long): Flow<List<Deal>>

    @Query("SELECT COUNT(*) FROM deals WHERE campaignId = :campaignId")
    fun countByCampaign(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM deals WHERE brokerId = :brokerId")
    fun countByBroker(brokerId: Long): Flow<Int>

    @Query("SELECT COALESCE(SUM(commissionAmount), 0) FROM deals WHERE brokerId = :brokerId AND commissionStatus = 'PAID'")
    fun getTotalPaidCommission(brokerId: Long): Flow<Double>

    @Query("SELECT COALESCE(SUM(commissionAmount), 0) FROM deals WHERE brokerId = :brokerId AND commissionStatus = 'PENDING'")
    fun getTotalPendingCommission(brokerId: Long): Flow<Double>

    @Query("SELECT SUM(d.dealValue) FROM deals d WHERE d.campaignId = :campaignId")
    fun getTotalDealValue(campaignId: Long): Flow<Double?>

    @Query("UPDATE deals SET stage = :stage WHERE id = :id")
    suspend fun updateStage(id: Long, stage: String)

    @Query("UPDATE deals SET commissionStatus = :status WHERE id = :id")
    suspend fun updateCommissionStatus(id: Long, status: String)

    @Query("DELETE FROM deals WHERE campaignId = :campaignId")
    suspend fun deleteByCampaign(campaignId: Long)
}