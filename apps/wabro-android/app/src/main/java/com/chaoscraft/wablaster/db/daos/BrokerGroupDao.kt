package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import kotlinx.coroutines.flow.Flow

@Dao
interface BrokerGroupDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(group: BrokerGroup): Long

    @Update
    suspend fun update(group: BrokerGroup)

    @Delete
    suspend fun delete(group: BrokerGroup)

    @Query("SELECT * FROM broker_groups WHERE id = :id")
    suspend fun getById(id: Long): BrokerGroup?

    @Query("SELECT * FROM broker_groups ORDER BY name ASC")
    fun getAll(): Flow<List<BrokerGroup>>

    @Query("SELECT * FROM broker_groups WHERE type = :type ORDER BY name ASC")
    fun getByType(type: String): Flow<List<BrokerGroup>>

    @Query("SELECT * FROM broker_groups WHERE name LIKE '%' || :query || '%' ORDER BY name ASC")
    fun search(query: String): Flow<List<BrokerGroup>>

    @Query("SELECT COUNT(*) FROM broker_groups")
    suspend fun count(): Int

    @Query("UPDATE broker_groups SET brokerCount = (SELECT COUNT(*) FROM broker_group_cross_ref WHERE groupId = :groupId) WHERE id = :groupId")
    suspend fun updateBrokerCount(groupId: Long)

    @Query("DELETE FROM broker_groups WHERE id = :id")
    suspend fun deleteById(id: Long)
}