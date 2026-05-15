package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.BrokerGroupCrossRef
import kotlinx.coroutines.flow.Flow

@Dao
interface BrokerGroupCrossRefDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(crossRef: BrokerGroupCrossRef)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(crossRefs: List<BrokerGroupCrossRef>)

    @Delete
    suspend fun delete(crossRef: BrokerGroupCrossRef)

    @Query("DELETE FROM broker_group_cross_ref WHERE groupId = :groupId")
    suspend fun deleteByGroup(groupId: Long)

    @Query("DELETE FROM broker_group_cross_ref WHERE brokerId = :brokerId AND groupId = :groupId")
    suspend fun removeBrokerFromGroup(brokerId: Long, groupId: Long)

    @Query("""
        SELECT b.* FROM brokers b
        INNER JOIN broker_group_cross_ref bgcr ON b.id = bgcr.brokerId
        WHERE bgcr.groupId = :groupId
        ORDER BY b.name ASC
    """)
    fun getBrokersInGroup(groupId: Long): Flow<List<Broker>>

    @Query("SELECT groupId FROM broker_group_cross_ref WHERE brokerId = :brokerId")
    suspend fun getGroupIdsForBroker(brokerId: Long): List<Long>

    @Query("SELECT brokerId FROM broker_group_cross_ref WHERE groupId = :groupId")
    suspend fun getBrokerIdsInGroup(groupId: Long): List<Long>

    @Query("SELECT COUNT(*) FROM broker_group_cross_ref WHERE groupId = :groupId")
    suspend fun countInGroup(groupId: Long): Int

    @Query("DELETE FROM broker_group_cross_ref")
    suspend fun deleteAll()
}
