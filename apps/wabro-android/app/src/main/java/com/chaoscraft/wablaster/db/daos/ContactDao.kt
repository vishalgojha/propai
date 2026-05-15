package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.Contact
import kotlinx.coroutines.flow.Flow

@Dao
interface ContactDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: Contact)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(contacts: List<Contact>)

    @Query("SELECT * FROM contacts WHERE campaignId = :campaignId")
    fun getByCampaign(campaignId: Long): Flow<List<Contact>>

    @Query("SELECT * FROM contacts WHERE campaignId = :campaignId AND sent = 0")
    suspend fun getPendingByCampaign(campaignId: Long): List<Contact>

    @Query("SELECT * FROM contacts WHERE campaignId = :campaignId AND sent = 0 ORDER BY rowid ASC LIMIT 1")
    suspend fun getNextPending(campaignId: Long): Contact?

    @Query("UPDATE contacts SET sent = 1 WHERE phone = :phone AND campaignId = :campaignId")
    suspend fun markSent(phone: String, campaignId: Long)

    @Query("UPDATE contacts SET sent = 0 WHERE phone = :phone AND campaignId = :campaignId")
    suspend fun markPending(phone: String, campaignId: Long)

    @Query("UPDATE contacts SET sent = 1 WHERE campaignId = :campaignId AND sent = 0")
    suspend fun markAllSent(campaignId: Long)

    @Query("SELECT COUNT(*) FROM contacts WHERE campaignId = :campaignId")
    fun getCount(campaignId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM contacts WHERE campaignId = :campaignId AND sent = 1")
    suspend fun getSentCount(campaignId: Long): Int

    @Query("SELECT COUNT(*) FROM contacts WHERE campaignId = :campaignId AND sent = 0")
    suspend fun getPendingCount(campaignId: Long): Int

    @Query("DELETE FROM contacts WHERE campaignId = :campaignId")
    suspend fun deleteByCampaign(campaignId: Long)
}
